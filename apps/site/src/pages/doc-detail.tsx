import { BookOpenText } from "@phosphor-icons/react";
import { renderMarkdown } from "../lib/content";
import { SiteLink } from "../lib/site-link";
import type { DocPage } from "../lib/types";

export function DocPageView({ doc, docs }: { doc: DocPage; docs: DocPage[] }) {
  return (
    <section className="reader-layout section-gap">
      <aside className="reader-sidebar">
        <div className="reader-sidebar-inner">
          <SiteLink className="sidebar-home" to="/docs">
            <BookOpenText size={18} weight="duotone" />
            All docs
          </SiteLink>
          <div className="reader-note">
            <span>Reading</span>
            <strong>{doc.title}</strong>
            <p>{doc.description}</p>
          </div>
          <nav aria-label="Docs">
            {docs.map((item) => (
              <SiteLink
                className={item.slug === doc.slug ? "active" : undefined}
                key={item.slug}
                to={`/docs/${item.slug}`}
                aria-current={item.slug === doc.slug ? "page" : undefined}
              >
                {item.title}
              </SiteLink>
            ))}
          </nav>
        </div>
      </aside>
      <article className="markdown-card">
        <div className="page-kicker">Docs / {doc.slug}</div>
        <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(doc.markdown)} />
      </article>
    </section>
  );
}
