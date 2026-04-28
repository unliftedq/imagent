import { z } from "zod";

export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  coverItemId: z.string().nullable().optional(),
  position: z.number().int().nonnegative().default(0),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Board = z.infer<typeof BoardSchema>;

export const BoardItemSchema = z.object({
  boardId: z.string(),
  itemId: z.string(),
  position: z.number().int(),
  addedAt: z.number().int(),
});
export type BoardItem = z.infer<typeof BoardItemSchema>;
