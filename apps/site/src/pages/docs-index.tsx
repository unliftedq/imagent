import { ArrowRight } from "@phosphor-icons/react";
import { SiteLink } from "../lib/site-link";
import type { DocPage } from "../lib/types";

const featuredSlugs = new Set(["quick-start", "providers", "cli"]);

export function DocsIndexPage({ docs }: { docs: DocPage[] }) {
  const featuredDocs = docs.filter((doc) => featuredSlugs.has(doc.slug));
  const referenceDocs = docs.filter((doc) => !featuredSlugs.has(doc.slug));

  return (
    <section className="page-shell section-gap">
      <div className="page-kicker">Documentation</div>
      <div className="page-hero compact-hero">
        <h1>Guides for running IMAGENT from source, desktop, and terminal.</h1>
        <p>
          Find the setup, provider, CLI, configuration, update, and workflow details needed to use
          the desktop app and command-line tool together.
        </p>
      </div>

      <div className="doc-feature-grid" aria-label="Recommended documents">
        {featuredDocs.map((doc) => (
          <SiteLink className="doc-card featured hover-lift" key={doc.slug} to={`/docs/${doc.slug}`}>
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <span>
              Read document <ArrowRight size={17} />
            </span>
          </SiteLink>
        ))}
      </div>

      <div className="reference-section">
        <div className="section-head compact-head">
          <h2>Reference documents</h2>
        </div>
        <div className="doc-index-grid">
          {referenceDocs.map((doc) => (
            <SiteLink className="doc-card hover-lift" key={doc.slug} to={`/docs/${doc.slug}`}>
              <h2>{doc.title}</h2>
              <p>{doc.description}</p>
              <span>
                Read document <ArrowRight size={17} />
              </span>
            </SiteLink>
          ))}
        </div>
      </div>
    </section>
  );
}
