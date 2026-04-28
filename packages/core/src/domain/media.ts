import { z } from "zod";

export const MediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;
