import { z } from "zod";
import { ImageModelDefSchema, VideoModelDefSchema } from "@imagine/core";

/**
 * JSON catalog schema. The bundled default ships in `catalog.default.json`;
 * the runtime catalog lives at `~/.imagine/catalog.json` (user-editable). On
 * load the runtime file is parsed against this schema and used as the
 * canonical model list for every well-known provider. See
 * architecture.md §4 (Models & Capabilities).
 *
 * v1 keys: `image` and `video` are records of `<providerId> → ModelDef[]`.
 * Provider construction pulls a slice per vendor (`catalog.image.openai`,
 * `catalog.video.bytedance`, etc.) from this object.
 */
export const ModelCatalogSchema = z.object({
  version: z.literal(1),
  image: z.record(z.string(), z.array(ImageModelDefSchema)),
  video: z.record(z.string(), z.array(VideoModelDefSchema)),
  comments: z.string().optional(),
});

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;
