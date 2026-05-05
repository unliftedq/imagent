import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFileConfigStore, createFileSecretsStore } from "@imagine/config";
import { ensureDataDir, openDatabase } from "@imagine/persistence";
import type { Logger } from "@imagine/core";
import { createDesktopPathResolver } from "./app-paths.js";
import { bootstrapRuntime, type RuntimeServices } from "./job-runner-bootstrap.js";
import { setupIpc } from "./ipc-handlers.js";

const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(__dirname, "..", "..", "assets", "imagine.png");
const macAppIconPath = path.resolve(__dirname, "..", "..", "assets", "imagine-macos.png");

/**
 * Custom URL scheme that serves files inside the user's data dir back to the
 * renderer. The renderer uses `imagine://local/<relPath>` (e.g.
 * `imagine://local/gallery/2026/04/foo.png`) for `<img src=...>`/`<video src=...>`
 * — Electron's default web security blocks plain `file://` URLs from being
 * loaded by a renderer served over `http://localhost` (dev) or `file://app/...`
 * (prod), so we tunnel through this scheme instead. Must be registered as
 * privileged BEFORE `app.whenReady`, otherwise `protocol.handle` won't be
 * allowed to attach.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "imagine",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

/**
 * Walk the cause chain on an Error and produce a flat plain-object suitable
 * for logging. Without this, util.inspect prints the top-level Error stack
 * but stops at `cause` (which is what most provider SDKs wrap underlying
 * HTTP errors with). The resulting object is what the logger appends after
 * the message, and Node's default inspector renders multi-line stacks.
 */
function inflateError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  // Carry forward enumerable own props (provider errors stash `vendorId`,
  // `status`, `code`, etc. as own props).
  for (const k of Object.keys(err)) {
    if (k in out) continue;
    out[k] = (err as unknown as Record<string, unknown>)[k];
  }
  if (err.cause !== undefined) {
    out.cause = inflateError(err.cause);
  }
  return out;
}

/** Replace any `err`/`cause` field in the meta object with an inflated version. */
function inflateMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = k === "err" || k === "cause" || v instanceof Error ? inflateError(v) : v;
  }
  return out;
}

const logger: Logger = {
  debug: (msg, ctx) => console.debug("[main]", msg, inflateMeta(ctx) ?? ""),
  info: (msg, ctx) => console.info("[main]", msg, inflateMeta(ctx) ?? ""),
  warn: (msg, ctx) => console.warn("[main]", msg, inflateMeta(ctx) ?? ""),
  error: (msg, ctx) => console.error("[main]", msg, inflateMeta(ctx) ?? ""),
};

async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#fffaf0",
    autoHideMenuBar: true,
    title: "Imagine Studio",
    icon: process.platform === "darwin" ? macAppIconPath : appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // need preload to require electron's ipcRenderer
      preload: preloadPath,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    const url = process.env.IMAGINE_DEV_SERVER ?? "http://localhost:5173";
    await mainWindow.loadURL(url);
    if (process.env.IMAGINE_OPEN_DEVTOOLS !== "0") {
      mainWindow.webContents.openDevTools({ mode: "right" });
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Wire `imagine://local/<relPath>` to a path inside the data dir. The
 * normalized absolute path is whitelisted against the data dir prefix so a
 * renderer-side `..` in the rel path can't escape and read e.g. `secrets.json`.
 */
function registerImagineProtocol(dataDir: string): void {
  const dataDirAbs = path.normalize(dataDir);
  protocol.handle("imagine", async (request) => {
    try {
      const url = new URL(request.url);
      const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const absPath = path.normalize(path.join(dataDirAbs, relPath));
      if (!absPath.startsWith(dataDirAbs)) {
        return new Response("forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(absPath).toString());
    } catch (err) {
      logger.warn("imagine:// fetch failed", { url: request.url, err });
      return new Response("not found", { status: 404 });
    }
  });
}

async function bootstrap(): Promise<RuntimeServices> {
  const paths = createDesktopPathResolver();
  await ensureDataDir(paths);
  registerImagineProtocol(paths.dataDir);

  const db = openDatabase(paths.dbFile());
  const configStore = createFileConfigStore(paths.configFile());
  const secretsStore = createFileSecretsStore(paths.secretsFile());

  const runtime = await bootstrapRuntime({ db, configStore, secretsStore, paths, logger });
  const ipcServer = setupIpc({
    ipcMain,
    db,
    configStore,
    secretsStore,
    paths,
    logger,
    runtime,
    getMainWindow: () => mainWindow,
  });

  // Forward JobRunner events to all renderer windows.
  const forward =
    (channel: "job.progress" | "job.completed" | "job.failed") => (payload: unknown) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, payload);
      }
    };
  runtime.jobRunner.on("job.progress", forward("job.progress"));
  runtime.jobRunner.on("job.completed", forward("job.completed"));
  runtime.jobRunner.on("job.failed", forward("job.failed"));

  // Make sure newly-created windows can also receive emit() events.
  app.on("browser-window-created", (_e, win) => {
    ipcServer.addEventTarget(win.webContents);
  });

  return runtime;
}

app.whenReady().then(async () => {
  try {
    if (process.platform === "darwin") {
      app.dock.setIcon(macAppIconPath);
    }
    const t0 = Date.now();
    const runtime = await bootstrap();
    await createWindow();
    // M8 cold-start: defer cross-session job resume until the first paint
    // lands. This shaves provider polling RTT off the path from app launch
    // to first frame.
    if (mainWindow) {
      mainWindow.webContents.once("did-finish-load", () => {
        logger.info("[main] first paint", { ms: Date.now() - t0 });
        void runtime.resumeRunningJobs();
      });
    } else {
      void runtime.resumeRunningJobs();
    }
  } catch (err) {
    logger.error("[main] bootstrap failed", { err: String(err) });
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow === null) {
    await createWindow();
  }
});
