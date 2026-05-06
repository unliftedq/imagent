import type { ImageReference } from "../domain/request.js";

/**
 * Add deterministic, numbered reference instructions to the prompt. The
 * numbering is intentionally the same as the provider attachment order so
 * text instructions cannot drift away from the binary image inputs.
 */
export function appendImageReferenceInstructions(
  prompt: string,
  references: readonly ImageReference[],
): string {
  if (references.length === 0) return prompt;
  const base = prompt.trim();
  const lines = references.map((ref, index) => {
    const n = index + 1;
    const role = ref.role ?? "freeform";
    const source = referenceSourceLabel(ref.path);
    return `Reference image ${n} (attached image ${n}) — role: ${role} — source: ${source}.`;
  });
  const appendix = [
    "Reference images are attached in this exact order. Keep each numbered instruction matched to the same-numbered attached image:",
    ...lines,
  ].join("\n");
  return base ? `${base}\n\n${appendix}` : appendix;
}

function referenceSourceLabel(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || "unknown";
}
