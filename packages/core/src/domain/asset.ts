import { z } from "zod";

export const AssetKindSchema = z.enum(["character", "object", "background", "style"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetFileRoleSchema = z.enum(["reference", "thumbnail"]);
export type AssetFileRole = z.infer<typeof AssetFileRoleSchema>;

export const AssetFileSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  role: AssetFileRoleSchema,
  relPath: z.string(),
  mimeType: z.string(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  position: z.number().int().nonnegative().default(0),
  createdAt: z.number().int(),
});
export type AssetFile = z.infer<typeof AssetFileSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  promptSnippet: z.string().nullable().optional(),
  files: z.array(AssetFileSchema).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  archivedAt: z.number().int().nullable().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;
