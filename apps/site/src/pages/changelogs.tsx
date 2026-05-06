import type { ChangelogEntry } from "../lib/types";

export function ChangelogsPage({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <section className="page-shell section-gap">
      <div className="page-kicker">Changelogs</div>
      <div className="page-hero compact-hero">
        <h1>Release history for IMAGENT.</h1>
        <p>A concise timeline of product, provider, desktop, CLI, and local workspace changes.</p>
      </div>
      <div className="timeline full">
        {entries.map((entry) => (
          <article className="timeline-item" key={entry.version}>
            <div>
              <p className="version">{entry.version}</p>
              <p className="date">{entry.date}</p>
            </div>
            <ul>
              {entry.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
