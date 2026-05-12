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
import type { ChangelogEntry } from "../lib/types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const workflowItems = [
  {
    icon: Database,
    title: "Keep data local",
    copy: "Configuration, SQLite data, assets, thumbnails, and generated files stay in one local workspace.",
  },
  {
    icon: SquaresFour,
    title: "Reuse creative context",
    copy: "Characters, objects, backgrounds, and style references can be named once and reused across ongoing projects.",
  },
  {
    icon: BracketsCurly,
    title: "Compare providers",
    copy: "Run OpenAI, Azure OpenAI, Google, Flux, ByteDance, and xAI models without changing project structure.",
  },
  {
    icon: Command,
    title: "Move between app and terminal",
    copy: "Generate from scripts, review in the desktop gallery, then return to automation with the same history intact.",
  },
];

function ProductConsole() {
  return (
    <div className="product-console">
      <div className="console-grid">
        <article>
          <span>assets</span>
          <strong>characters / objects / styles</strong>
        </article>
        <article>
          <span>providers</span>
          <strong>OpenAI / Google / Flux / xAI</strong>
        </article>
        <article>
          <span>gallery</span>
          <strong>favorites / boards / lineage</strong>
        </article>
      </div>
      <div className="terminal-line">
        <Terminal size={18} weight="duotone" />
        <code>imagent image generate "product concept" --provider openai</code>
      </div>
    </div>
  );
}

export function HomePage({ changelogEntries }: { changelogEntries: ChangelogEntry[] }) {
  const root = useRef<HTMLDivElement | null>(null);
  const latestEntries = changelogEntries.slice(0, 2);

  useGSAP(
    () => {
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
        ".console-grid article",
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
          <p className="eyebrow">Local workspace for generated images and video</p>
          <h1>
            IMAGENT keeps your creative assets, providers, and generated results in one local
            system.
          </h1>
          <p className="hero-copy">
            Use the desktop studio for visual work, the CLI for repeatable jobs, and the same asset
            library across both. No account layer, no cloud sync requirement, no hidden project
            state.
          </p>
          <div className="hero-actions">
            <SiteLink className="btn btn-solid" to="/docs/quick-start">
              Start locally
            </SiteLink>
            <a className="text-link" href={githubUrl} target="_blank" rel="noreferrer">
              View repository <ArrowRight size={17} />
            </a>
          </div>
        </div>
        <ProductConsole />
      </section>

      <section className="workflow section-gap" data-reveal>
        <div className="section-head split-head">
          <h2>Built for creators who want control over the whole generation loop.</h2>
          <p>
            IMAGENT is a local project workspace for references, provider settings, generated files,
            review, and repeatable automation.
          </p>
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

      <section className="release-preview section-gap" data-reveal>
        <div className="section-head split-head">
          <h2>Recent release notes</h2>
          <SiteLink className="text-link" to="/changelogs">
            View changelogs <ArrowRight size={17} />
          </SiteLink>
        </div>
        <div className="timeline compact">
          {latestEntries.map((entry) => (
            <article className="timeline-item" key={entry.version}>
              <div>
                <p className="version">{entry.version}</p>
                <p className="date">{entry.date}</p>
              </div>
              <ul>
                {entry.notes.slice(0, 2).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
