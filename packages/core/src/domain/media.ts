import { z } from "zod";

export const MediaKindSchema = z.enum(["image", "video", "audio"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;
