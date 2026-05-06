import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(1) ?? "imagent";
const base = process.env.GITHUB_PAGES === "true" ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  plugins: [react()],
});
