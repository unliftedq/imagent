import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronSecretsStore,
  createFileConfigStore,
} from "@imagine-studio/config";
import { ensureDataDir, openDatabase } from "@imagine-studio/persistence";
import type { Logger } from "@imagine-studio/core";
import { createDesktopPathResolver } from "./app-paths.js";
import { bootstrapRuntime, type RuntimeServices } from "./job-runner-bootstrap.js";
import { setupIpc } from "./ipc-handlers.js";

const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

const logger: Logger = {
  debug: (msg, ctx) => console.debug("[main]", msg, ctx ?? ""),
  info: (msg, ctx) => console.info("[main]", msg, ctx ?? ""),
  warn: (msg, ctx) => console.warn("[main]", msg, ctx ?? ""),
  error: (msg, ctx) => console.error("[main]", msg, ctx ?? ""),
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
    title: "imagine-studio",
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

async function bootstrap(): Promise<RuntimeServices> {
  const paths = createDesktopPathResolver();
  await ensureDataDir(paths);

  const db = openDatabase(paths.dbFile());
  const configStore = createFileConfigStore(paths.configFile());
  const secretsStore = createElectronSecretsStore({
    safeStorage,
    binPath: paths.secretsBin(),
    jsonPath: paths.secretsFile(),
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
  });

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
  const forward = (channel: "job.progress" | "job.completed" | "job.failed") =>
    (payload: unknown) => {
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
    await bootstrap();
    await createWindow();
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
