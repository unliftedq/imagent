import { renderMarkdown } from "../lib/content";

export function ChangelogsPage({ markdown }: { markdown: string }) {
  return (
    <section className="page-shell section-gap">
      <div className="page-kicker">Changelogs</div>
      <div className="page-hero compact-hero">
        <h1>Release history for IMAGENT.</h1>
        <p>
          A concise timeline of product, provider, desktop, CLI, documentation, and local workspace
          changes.
        </p>
      </div>
      <article className="markdown-card changelog-card">
        <div className="markdown-body changelog-body" dangerouslySetInnerHTML={renderMarkdown(markdown)} />
      </article>
    </section>
  );
}
