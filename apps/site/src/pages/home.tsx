import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  BracketsCurly,
  Command,
  Database,
  SquaresFour,
  Terminal,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { githubUrl } from "../lib/constants";
import { SiteLink } from "../lib/site-link";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const workflowItems = [
  {
    icon: Command,
    title: "Generation as an agent capability",
    copy: "The bundled skill lets any compatible agent call the IMAGENT CLI to generate images, video, and speech as a native workflow step — no per-tool integration, no one-off glue code.",
  },
  {
    icon: BracketsCurly,
    title: "One interface, every provider and model",
    copy: "OpenAI, Azure, Google, Flux/BFL, BytePlus, 火山引擎, xAI, MiniMax, and ElevenLabs sit behind a single interface. Swap providers or models without rewriting prompts, parameters, or calls.",
  },
  {
    icon: Database,
    title: "Assets that outlive the prompt",
    copy: "Every image, video, and clip — plus reusable characters, styles, and references — is captured in a managed local library to curate, search, and reuse instead of regenerate.",
  },
  {
    icon: SquaresFour,
    title: "Desktop and terminal together",
    copy: "Run repeatable CLI jobs, review them in the desktop gallery, and keep the same history available to both.",
  },
];

const workflowPreviewItems = [
  {
    label: "Hand generation to the agent",
    detail: "Let any compatible agent call the IMAGENT CLI to produce images, video, and speech as a native step in its workflow.",
  },
  {
    label: "Unify every provider",
    detail: "Reach OpenAI, Azure, Google, Flux/BFL, BytePlus, 火山引擎, xAI, MiniMax, and ElevenLabs through one consistent interface.",
  },
  {
    label: "Keep every asset",
    detail: "Generated outputs, favorites, boards, and reusable assets stay in the same local library, ready to reuse across projects.",
  },
];

const startItems = [
  {
    title: "Quick Start",
    copy: "Create the workspace, configure a provider, and generate the first local result.",
    to: "/docs/quick-start",
  },
  {
    title: "Providers",
    copy: "Connect OpenAI, Azure, Google, Flux/BFL, BytePlus, 火山引擎, or xAI side by side.",
    to: "/docs/providers",
  },
  {
    title: "CLI for automation",
    copy: "Use IMAGENT from scripts, agents, and repeatable local generation workflows.",
    to: "/docs/cli",
  },
];

function ProductConsole() {
  return (
    <div className="product-console" aria-label="IMAGENT desktop and CLI summary">
      <div className="console-grid" aria-label="Human and automation surfaces">
        <div className="surface-lane human-lane">
          <span>Desktop for humans</span>
          <strong>See, compare, curate.</strong>
          <p>Work visually when taste, selection, and creative direction need a human eye.</p>
        </div>
        <div className="surface-lane agent-lane">
          <span>CLI for agents and automation</span>
          <strong>Script, repeat, inspect.</strong>
          <p>Give agents and scripts a stable local interface for generation, discovery, and review.</p>
        </div>
      </div>
      <div className="terminal-line">
        <Terminal size={18} weight="duotone" />
        <code>imagent image generate "idea" --provider openai</code>
      </div>
    </div>
  );
}

export function HomePage() {
  const root = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 86%",
            },
          },
        );
      });

      gsap.fromTo(
        ".surface-lane",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.12, duration: 0.7, ease: "power3.out" },
      );
    },
    { scope: root, revertOnUpdate: true },
  );

  return (
    <div ref={root}>
      <section className="hero section-gap" data-reveal>
        <div className="hero-copyblock">
          <p className="eyebrow">Imagine agent</p>
          <h1>Give your agents the power to create.</h1>
          <p className="hero-copy">
            IMAGENT lets AI agents generate images, video, and speech as a native step in their
            workflow — behind one interface that hides every provider and model difference, with
            every result kept in a local library for reuse instead of thrown away.
          </p>
          <div className="hero-actions">
            <SiteLink className="btn btn-solid" to="/docs/quick-start">
              Quick Start
            </SiteLink>
            <a className="text-link" href={githubUrl} target="_blank" rel="noreferrer">
              View repository <ArrowRight size={17} />
            </a>
          </div>
        </div>
        <ProductConsole />
      </section>

      <section className="setup-strip section-gap" data-reveal>
        <div className="section-head">
          <h2>From prompt to reusable asset.</h2>
        </div>
        <div className="setup-steps">
          {workflowPreviewItems.map((step, index) => (
            <article className="setup-step" key={step.label}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.label}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow section-gap" data-reveal>
        <div className="section-head">
          <h2>One generation loop.</h2>
        </div>
        <div className="workflow-grid">
          {workflowItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className="workflow-card hover-lift" key={item.title}>
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={24} weight="duotone" />
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="start-locally section-gap" data-reveal>
        <div className="section-head split-head">
          <h2>Start locally.</h2>
          <a className="text-link" href={githubUrl} target="_blank" rel="noreferrer">
            View repository <ArrowRight size={17} />
          </a>
        </div>
        <div className="start-grid">
          {startItems.map((item) => (
            <SiteLink className="start-card hover-lift" key={item.title} to={item.to}>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <span>
                Open guide <ArrowRight size={17} />
              </span>
            </SiteLink>
          ))}
        </div>
      </section>
    </div>
  );
}
