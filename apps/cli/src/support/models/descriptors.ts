import type { SpeechModelDef, ImageModelDef, VideoModelDef } from "@imagent/core";
import { combineSpeechFormat } from "@imagent/core";

import type { OptionDescriptor } from "./shared.js";

export function supportedImageOptionDescriptors(model: ImageModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  const out: OptionDescriptor[] = [];
  out.push({ key: "count", note: "positive integer (number of outputs)" });
  if (!caps) {
    return [
      ...out,
      { key: "size", note: "model has no capability metadata; provider will validate" },
      { key: "aspectRatio" },
      { key: "quality" },
      { key: "outputFormat" },
    ];
  }
  if (caps.sizes && caps.sizes.length > 0) out.push({ key: "size", allowed: [...caps.sizes] });
  if (caps.supportsArbitrarySize)
    out.push({ key: "size", note: "arbitrary WxH also accepted (supportsArbitrarySize=true)" });
  if (caps.aspectRatios && caps.aspectRatios.length > 0)
    out.push({ key: "aspectRatio", allowed: [...caps.aspectRatios] });
  if (caps.qualities && caps.qualities.length > 0)
    out.push({ key: "quality", allowed: [...caps.qualities] });
  if (caps.outputFormats && caps.outputFormats.length > 0)
    out.push({ key: "outputFormat", allowed: [...caps.outputFormats] });
  return out;
}

export function supportedVideoOptionDescriptors(model: VideoModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  if (!caps) {
    return [
      { key: "durationSec", note: "positive number; provider will validate" },
      { key: "fps", note: "positive number" },
      { key: "resolution" },
      { key: "aspectRatio" },
      { key: "firstFrame", note: "path to a starting-frame image" },
      { key: "lastFrame", note: "path to an ending-frame image" },
    ];
  }
  const out: OptionDescriptor[] = [];
  if (caps.durationsSec && caps.durationsSec.length > 0) {
    out.push({
      key: "durationSec",
      allowed: caps.durationsSec.map((n) => String(n)),
      note: caps.maxDurationSec ? `max ${caps.maxDurationSec}s` : undefined,
    });
  } else if (caps.maxDurationSec) {
    out.push({ key: "durationSec", note: `max ${caps.maxDurationSec}s` });
  }
  if (caps.fpsOptions && caps.fpsOptions.length > 0) {
    out.push({ key: "fps", allowed: caps.fpsOptions.map((n) => String(n)) });
  }
  if (caps.resolutions && caps.resolutions.length > 0) {
    out.push({ key: "resolution", allowed: [...caps.resolutions] });
  }
  if (caps.aspectRatios && caps.aspectRatios.length > 0) {
    out.push({ key: "aspectRatio", allowed: [...caps.aspectRatios] });
  }
  if (caps.supportsFirstFrame)
    out.push({ key: "firstFrame", note: "path to a starting-frame image" });
  if (caps.supportsLastFrame) out.push({ key: "lastFrame", note: "path to an ending-frame image" });
  return out;
}

export function supportedSpeechOptionDescriptors(model: SpeechModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  if (!caps) {
    return [
      { key: "voice", note: "provider will validate" },
      { key: "speed", note: "positive number; provider will validate" },
      { key: "outputFormat" },
    ];
  }
  const out: OptionDescriptor[] = [];
  if (caps.supportsVoiceDiscovery) {
    out.push({ key: "voice", note: "voice id from `imagent speech voices` (discovery)" });
  } else if (caps.voices && caps.voices.length > 0) {
    out.push({ key: "voice", allowed: caps.voices.map((v) => v.id) });
  }
  if (caps.speedRange) {
    out.push({
      key: "speed",
      note: `number from ${caps.speedRange.min} to ${caps.speedRange.max}`,
    });
  }
  if (caps.outputFormats && caps.outputFormats.length > 0) {
    const allowed = caps.outputFormats.flatMap((fmt) =>
      fmt.qualities.length > 0
        ? fmt.qualities.map((q) => combineSpeechFormat(fmt.codec, q))
        : [fmt.codec],
    );
    out.push({ key: "outputFormat", allowed });
  }
  for (const [key, knob] of Object.entries(caps.extraKnobs ?? {})) {
    out.push({
      key,
      allowed: knob.type === "enum" ? knob.values : undefined,
      note:
        knob.type === "number"
          ? `number${knob.min !== undefined || knob.max !== undefined ? ` ${knob.min ?? "…"}..${knob.max ?? "…"}` : ""}`
          : "provider-specific option",
    });
  }
  return out;
}

type ModelMatch =
  | { kind: "image"; def: ImageModelDef }
  | { kind: "video"; def: VideoModelDef }
  | { kind: "speech"; def: SpeechModelDef };

export function formatReferenceSummary(match: ModelMatch): string | undefined {
  if (match.kind === "speech") return undefined;
  const caps = match.def.capabilities;
  if (!caps) return undefined;
  const lines: string[] = [];
  if (typeof caps.maxReferences === "number") {
    if (caps.maxReferences === 0) {
      lines.push("  references not supported (maxReferences=0)");
    } else {
      lines.push(`  max references: ${caps.maxReferences}`);
    }
  }
  if (typeof caps.maxReferenceSizeMb === "number") {
    lines.push(`  max reference size: ${caps.maxReferenceSizeMb} MB`);
  }
  if (match.kind === "image") {
    const ic = match.def.capabilities;
    if (ic?.supportsStyleRef) lines.push("  supports style references");
  } else {
    const vc = match.def.capabilities;
    if (vc?.supportsRefImages) lines.push("  supports image references");
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : undefined;
}

export function formatCapabilityFlags(match: ModelMatch): string | undefined {
  const caps = match.def.capabilities;
  if (!caps) return undefined;
  const lines: string[] = [];
  if (match.kind === "image") {
    const ic = match.def.capabilities;
    if (typeof ic?.maxOutputs === "number")
      lines.push(`  max outputs per request: ${ic.maxOutputs}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : undefined;
}

export function buildExamples(providerId: string, match: ModelMatch): string[] {
  const examples: string[] = [];
  if (match.kind === "image") {
    const caps = match.def.capabilities;
    const opts: string[] = [];
    if (caps?.sizes?.[0]) opts.push(`--option size=${caps.sizes[0]}`);
    else if (caps?.aspectRatios?.[0]) opts.push(`--option aspectRatio=${caps.aspectRatios[0]}`);
    if (caps?.qualities?.[0]) opts.push(`--option quality=${caps.qualities[0]}`);
    examples.push(
      `imagent image generate "your prompt" --provider ${providerId} --model ${match.def.id}${opts.length ? ` ${opts.join(" ")}` : ""} --out ./outputs`,
    );
  } else if (match.kind === "video") {
    const caps = match.def.capabilities;
    const opts: string[] = [];
    if (caps?.durationsSec?.[0]) opts.push(`--option durationSec=${caps.durationsSec[0]}`);
    if (caps?.resolutions?.[0]) opts.push(`--option resolution=${caps.resolutions[0]}`);
    if (caps?.aspectRatios?.[0]) opts.push(`--option aspectRatio=${caps.aspectRatios[0]}`);
    examples.push(
      `imagent video generate "your prompt" --provider ${providerId} --model ${match.def.id}${opts.length ? ` ${opts.join(" ")}` : ""} --wait --out ./outputs`,
    );
  } else {
    const caps = match.def.capabilities;
    const opts: string[] = [];
    if (caps?.voices?.[0]) opts.push(`--option voice=${caps.voices[0].id}`);
    if (caps?.outputFormats?.[0]) {
      const first = caps.outputFormats[0];
      opts.push(`--option outputFormat=${combineSpeechFormat(first.codec, first.qualities[0])}`);
    }
    examples.push(
      `imagent speech synthesize "your text" --provider ${providerId} --model ${match.def.id}${opts.length ? ` ${opts.join(" ")}` : ""} --out ./outputs`,
    );
  }
  return examples;
}
