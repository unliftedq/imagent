import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackagePath = path.join(rootDir, "package.json");
const checkOnly = process.argv.includes("--check");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const rootPackage = await readJson(rootPackagePath);
const rootVersion = rootPackage.version;
const workspacePatterns = Array.isArray(rootPackage.workspaces)
  ? rootPackage.workspaces
  : rootPackage.workspaces?.packages;

if (!rootVersion) {
  throw new Error("Root package.json must define a version.");
}

if (!Array.isArray(workspacePatterns)) {
  throw new Error("Root package.json must define workspaces as an array or workspaces.packages.");
}

const workspacePackagePaths = [];

for (const pattern of workspacePatterns) {
  const parts = pattern.split("/");
  const starIndex = parts.indexOf("*");

  if (starIndex === -1 || starIndex !== parts.length - 1) {
    throw new Error(`Unsupported workspace pattern: ${pattern}`);
  }

  const parentDir = path.join(rootDir, ...parts.slice(0, starIndex));
  const entries = await readdir(parentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      workspacePackagePaths.push(path.join(parentDir, entry.name, "package.json"));
    }
  }
}

const changed = [];

for (const packagePath of workspacePackagePaths.sort()) {
  const packageJson = await readJson(packagePath);

  if (packageJson.version === rootVersion) {
    continue;
  }

  const relativePath = path.relative(rootDir, packagePath).replaceAll(path.sep, "/");
  changed.push(`${packageJson.name ?? relativePath}: ${packageJson.version ?? "<missing>"} -> ${rootVersion}`);

  if (!checkOnly) {
    packageJson.version = rootVersion;
    await writeJson(packagePath, packageJson);
  }
}

if (changed.length > 0) {
  const message = changed.map((item) => `- ${item}`).join("\n");

  if (checkOnly) {
    throw new Error(`Workspace package versions are not synced with root ${rootVersion}:\n${message}`);
  }

  console.log(`Synced workspace package versions to ${rootVersion}:\n${message}`);
} else {
  console.log(`Workspace package versions already match root ${rootVersion}.`);
}