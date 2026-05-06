import { ArrowRight } from "@phosphor-icons/react";
import { SiteLink } from "../lib/site-link";
import type { DocPage } from "../lib/types";

export function DocsIndexPage({ docs }: { docs: DocPage[] }) {
  return (
    <section className="page-shell section-gap">
      <div className="page-kicker">Documentation</div>
      <div className="page-hero compact-hero">
        <h1>Guides for running IMAGENT locally.</h1>
        <p>
          Find the setup, provider, CLI, configuration, update, and workflow details needed to use
          the desktop app and command-line tool together.
        </p>
      </div>
      <div className="doc-index-grid">
        {docs.map((doc) => (
          <SiteLink className="doc-card hover-lift" key={doc.slug} to={`/docs/${doc.slug}`}>
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <span>
              Read document <ArrowRight size={17} />
            </span>
          </SiteLink>
        ))}
      </div>
    </section>
  );
}
