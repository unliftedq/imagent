import { SiteLink } from "../lib/site-link";

export function NotFoundPage() {
  return (
    <section className="page-shell section-gap not-found">
      <div className="page-kicker">Not found</div>
      <h1>That page is not part of the IMAGENT site.</h1>
      <SiteLink className="btn btn-solid" to="/">
        Back home
      </SiteLink>
    </section>
  );
}
