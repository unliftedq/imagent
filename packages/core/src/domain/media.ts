import { z } from "zod";

export const MediaKindSchema = z.enum(["image", "video", "speech"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;
