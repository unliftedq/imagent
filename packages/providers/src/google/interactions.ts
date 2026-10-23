import type { GoogleGenAIRequestOptions, Interactions } from "@google/genai";
import { ProviderResponseError } from "@imagent/core";
import { rethrowGenericSdkError } from "../common/index.js";

export interface GoogleInteractionsClientLike {
  create(
    params: Interactions.InteractionCreateParams.CreateModelInteractionParamsNonStreaming,
    options?: GoogleGenAIRequestOptions,
  ): Promise<Interactions.Interaction>;
  get?(id: string): Promise<Interactions.Interaction>;
  cancel?(id: string): Promise<Interactions.Interaction>;
}

export async function createInteraction(
  client: GoogleInteractionsClientLike | undefined,
  params: Interactions.InteractionCreateParams.CreateModelInteractionParamsNonStreaming,
  signal?: AbortSignal,
): Promise<Interactions.Interaction> {
  if (!client) {
    throw new ProviderResponseError("SDK does not expose the Google Interactions API", {
      vendorId: "google",
    });
  }
  try {
    return await client.create(params, signal ? { signal } : undefined);
  } catch (err) {
    rethrowGenericSdkError(err, "google");
  }
}

export function assertInteractionCompleted(interaction: Interactions.Interaction): void {
  if (interaction.status !== "completed") {
    throw new ProviderResponseError(
      `Google interaction ${interaction.status}: ${
        interaction.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join("; ") || "generation did not complete"
      }`,
      { vendorId: "google" },
    );
  }
}

export function interactionContent(interaction: Interactions.Interaction): Interactions.Content[] {
  const content = (interaction.steps ?? []).flatMap((step) =>
    step.type === "model_output" ? (step.content ?? []) : [],
  );
  if (
    content.some((part) => part.type === "image" || part.type === "audio" || part.type === "video")
  ) {
    return content;
  }
  return [interaction.output_image, interaction.output_audio, interaction.output_video].filter(
    (part): part is NonNullable<typeof part> => part !== undefined,
  );
}
