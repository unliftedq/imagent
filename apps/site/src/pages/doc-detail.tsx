import { BookOpenText } from "@phosphor-icons/react";
import { renderMarkdown } from "../lib/content";
import { SiteLink } from "../lib/site-link";
import type { DocPage } from "../lib/types";

export function DocPageView({ doc, docs }: { doc: DocPage; docs: DocPage[] }) {
  return (
    <section className="reader-layout section-gap">
      <aside className="reader-sidebar">
        <SiteLink className="sidebar-home" to="/docs">
          <BookOpenText size={18} weight="duotone" />
          All docs
        </SiteLink>
        <nav aria-label="Docs">
          {docs.map((item) => (
            <SiteLink
              className={item.slug === doc.slug ? "active" : undefined}
              key={item.slug}
              to={`/docs/${item.slug}`}
            >
              {item.title}
            </SiteLink>
          ))}
        </nav>
      </aside>
      <article className="markdown-card">
        <div className="page-kicker">Docs / {doc.slug}</div>
        <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(doc.markdown)} />
      </article>
    </section>
  );
}
