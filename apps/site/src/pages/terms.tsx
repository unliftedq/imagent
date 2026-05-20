import { githubUrl } from "../lib/constants";
import { SiteLink } from "../lib/site-link";

export function TermsPage() {
  return (
    <section className="page-shell section-gap legal-page">
      <div className="page-kicker">Terms of Use</div>
      <div className="page-hero compact-hero">
        <h1>Terms for using IMAGENT.</h1>
        <p>
          These terms explain the basic expectations for using the IMAGENT website, desktop app,
          command-line tools, and related documentation.
        </p>
      </div>

      <article className="markdown-card legal-card">
        <div className="markdown-body">
          <p>
            <strong>Last updated:</strong> May 20, 2026
          </p>

          <h2>Use of the project</h2>
          <p>
            IMAGENT is provided as open-source software and documentation for local image and video
            generation workflows. You are responsible for how you install, configure, and use the
            project, including any prompts, assets, provider credentials, generated outputs, and
            automation you create with it.
          </p>

          <h2>Third-party services</h2>
          <p>
            IMAGENT can connect to third-party model providers and tools. Those services are not
            operated by IMAGENT, and your use of them is governed by their own terms, policies,
            limits, pricing, and content rules.
          </p>

          <h2>Acceptable use</h2>
          <p>
            Do not use IMAGENT or this website to violate law, infringe rights, bypass provider
            safety systems, distribute malware, or create content that you are not permitted to
            create or share. You are responsible for reviewing outputs before publishing or relying
            on them.
          </p>

          <h2>No warranties</h2>
          <p>
            IMAGENT is provided on an “as is” and “as available” basis. The project does not promise
            uninterrupted availability, compatibility with every provider, fitness for a particular
            purpose, or that generated content will be accurate, safe, or suitable for your use.
          </p>

          <h2>Open-source license</h2>
          <p>
            Repository code is licensed under the license included with the project. If these terms
            conflict with that license for the code itself, the open-source license controls for that
            code.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may be updated as the project evolves. Continued use of the website or
            project after updates means you accept the revised terms.
          </p>

          <h2>Contact</h2>
          <p>
            For questions, open an issue or discussion in the{" "}
            <a href={githubUrl} target="_blank" rel="noreferrer">
              IMAGENT GitHub repository
            </a>
            . You can also review the <SiteLink to="/privacy">Privacy Policy</SiteLink>.
          </p>
        </div>
      </article>
    </section>
  );
}
