import bflUrl from "../../assets/logos/bfl.svg?url";
import bytedanceUrl from "../../assets/logos/bytedance.svg?url";
import googleUrl from "../../assets/logos/google.svg?url";
import microsoftUrl from "../../assets/logos/microsoft.svg?url";
import nanoBananaUrl from "../../assets/logos/nanobanana.svg?url";
import openaiUrl from "../../assets/logos/openai.svg?url";
import xaiUrl from "../../assets/logos/xai.svg?url";

export interface ModelLogo {
  /** URL of the SVG, imported through Vite. */
  src: string;
  /** Accessible label for the logo (the model developer's name). */
  alt: string;
}

/**
 * Resolve the logo to display for a catalog model. Logos follow the model's
 * **developer** — who built and trains the model — not the provider that
 * happens to be serving it. So `gpt-image-2` is always OpenAI even when
 * routed through Azure, and `MAI-Image-2` is Microsoft regardless of which
 * Azure region hosts it.
 *
 * Assets are downloaded from Lobehub's static-svg CDN (see
 * `apps/desktop/src/renderer/assets/logos`).
 */
export function pickModelLogo(modelId: string): ModelLogo | undefined {
  if (modelId.startsWith("gpt-image")) {
    return { src: openaiUrl, alt: "OpenAI" };
  }
  if (modelId.startsWith("MAI-Image")) {
    return { src: microsoftUrl, alt: "Microsoft" };
  }
  if (
    modelId === "gemini-2.5-flash-image" ||
    modelId === "gemini-3.1-flash-image-preview" ||
    modelId === "gemini-3-pro-image-preview"
  ) {
    return { src: nanoBananaUrl, alt: "Nano Banana" };
  }
  if (modelId.startsWith("gemini-") || modelId.startsWith("veo-")) {
    return { src: googleUrl, alt: "Google" };
  }
  if (modelId.startsWith("flux-")) {
    return { src: bflUrl, alt: "Black Forest Labs" };
  }
  if (modelId.startsWith("doubao-")) {
    return { src: bytedanceUrl, alt: "ByteDance" };
  }
  if (modelId.startsWith("grok-")) {
    return { src: xaiUrl, alt: "xAI" };
  }
  return undefined;
}
