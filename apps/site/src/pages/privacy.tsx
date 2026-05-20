import { githubUrl } from "../lib/constants";
import { SiteLink } from "../lib/site-link";

export function PrivacyPage() {
  return (
    <section className="page-shell section-gap legal-page">
      <div className="page-kicker">Privacy Policy</div>
      <div className="page-hero compact-hero">
        <h1>Privacy for the website and local app.</h1>
        <p>
          IMAGENT is designed around a local workspace. This policy explains what the project itself
          collects and what may be handled by services you choose to configure.
        </p>
      </div>

      <article className="markdown-card legal-card">
        <div className="markdown-body">
          <p>
            <strong>Last updated:</strong> May 20, 2026
          </p>

          <h2>Website data</h2>
          <p>
            The IMAGENT website is a static site. It does not ask you to create an account, submit
            personal information, or provide payment information. Basic hosting, browser, or network
            logs may still be processed by the platform that serves the site.
          </p>

          <h2>Local application data</h2>
          <p>
            The desktop and CLI tools store workspace data on your device, including configuration,
            provider settings, assets, prompts, generated outputs, thumbnails, and job history. The
            project does not operate a hosted account system that automatically receives this local
            workspace data.
          </p>

          <h2>Provider credentials and generated content</h2>
          <p>
            If you configure third-party providers, IMAGENT sends the prompts, references, settings,
            and credentials needed to complete your requested generation jobs. Those providers may
            process and retain data according to their own privacy policies and service terms.
          </p>

          <h2>Browser storage</h2>
          <p>
            The website stores your light or dark theme preference in browser local storage so the
            interface can keep the same appearance on future visits.
          </p>

          <h2>Your choices</h2>
          <p>
            You can clear browser storage, delete local workspace files, rotate provider keys, or
            disconnect providers at any time. Be careful when sharing logs, screenshots, or
            generated assets because they may include prompts, file paths, credentials, or other
            sensitive information.
          </p>

          <h2>Changes</h2>
          <p>
            This policy may be updated as the project and website change. The latest version will be
            published on this page.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy questions, open an issue or discussion in the{" "}
            <a href={githubUrl} target="_blank" rel="noreferrer">
              IMAGENT GitHub repository
            </a>
            . You can also review the <SiteLink to="/terms">Terms of Use</SiteLink>.
          </p>
        </div>
      </article>
    </section>
  );
}
