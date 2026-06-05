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
    icon: Database,
    title: "One local workspace",
    copy: "State, configuration, assets, thumbnails, and generated outputs live under the shared IMAGENT workspace.",
  },
  {
    icon: SquaresFour,
    title: "Reusable creative assets",
    copy: "Characters, objects, backgrounds, styles, and references can be named once and reused in later jobs.",
  },
  {
    icon: BracketsCurly,
    title: "Provider choice stays explicit",
    copy: "OpenAI, Azure, Google, Flux/BFL, BytePlus, 火山引擎, and xAI provider IDs can be configured side by side.",
  },
  {
    icon: Command,
    title: "Desktop and terminal together",
    copy: "Run repeatable CLI jobs, review them in the desktop gallery, and keep the same history available to both.",
  },
];

const workflowPreviewItems = [
  {
    label: "Collect context",
    detail: "Name characters, objects, backgrounds, styles, and references once so later generations can reuse them.",
  },
  {
    label: "Generate anywhere",
    detail: "Use the desktop studio for visual work or the CLI when an agent, script, or repeatable job needs control.",
  },
  {
    label: "Keep the lineage",
    detail: "Generated outputs, favorites, boards, config, and provider routing stay available in the same local workspace.",
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
          <p className="eyebrow">Imagine agent, kept local</p>
          <h1>The local agent that turns imagination into work.</h1>
          <p className="hero-copy">
            IMAGENT gives image, video, and audio creation a local operating layer: a visual studio
            for human taste, a CLI for agentic work, and one shared memory for every result.
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
          <h2>From idea to reusable context.</h2>
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
