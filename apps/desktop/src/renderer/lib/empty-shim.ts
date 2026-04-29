// Empty shim used by the renderer Vite alias to satisfy `import("node:fs/promises")`
// pulled in transitively by JobRunner's defaultWriteFile/defaultEnsureDir
// helpers. Those code paths never execute in the renderer.
export {};
export const writeFile = () => {
  throw new Error("fs is not available in the renderer");
};
export const mkdir = () => {
  throw new Error("fs is not available in the renderer");
};
export default {};
