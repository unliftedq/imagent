/**
 * Type declarations for Vite asset imports used by the renderer.
 */

declare module "*.svg?url" {
  const src: string;
  export default src;
}
