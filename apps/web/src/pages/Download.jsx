import { Link } from 'react-router-dom';

const MAC_DOWNLOAD_URL = 'https://pub-8e1040a752d1451998c6bbdb3e4117d2.r2.dev/Annotated.dmg';

export default function Download() {
  return (
    <div className="page page-download">
      <header className="download-heading">
        <p>Annotated Pro</p>
        <h1>Get the desktop app</h1>
        <p className="download-subhead">
          Good news — it's free for you today. We can't set up Stripe payments at this time, so the full desktop experience is on us. Enjoy.
        </p>
      </header>

      <section className="download-card" aria-labelledby="download-mac-title">
        <div>
          <p className="download-kicker">Mac desktop</p>
          <h2 id="download-mac-title">Annotated for Mac</h2>
          <p>
            Clip articles, YouTube, podcasts and screen recordings into a local-first annotation workspace, then publish the notes that belong in the public feed. Includes AI summary hooks when local models are available.
          </p>
        </div>
        <div className="download-card-action">
          <a className="button button-solid download-button" href={MAC_DOWNLOAD_URL}>
            Download Annotated.dmg
          </a>
          <p>Requires macOS 13 Ventura or later · Apple Silicon &amp; Intel</p>
        </div>
      </section>

      <section className="download-notes" aria-labelledby="desktop-unlocks-title">
        <h2 id="desktop-unlocks-title">What desktop unlocks</h2>
        <div className="download-note-grid">
          <article>
            <span>Beyond the browser</span>
            <p>Capture from your screen, not only a Chrome tab. That means video, documents, research windows and work happening outside the extension.</p>
          </article>
          <article>
            <span>Private first</span>
            <p>Save clips locally as private notes, refine them in your own workspace, then choose what becomes public commentary.</p>
          </article>
          <article>
            <span>Same public layer</span>
            <p>Published desktop annotations sync back into the same Annotated feed, profile and discussion system used by the web app and extension.</p>
          </article>
        </div>
      </section>

      <Link className="back-link download-back-link" to="/feed">← Back to feed</Link>
    </div>
  );
}
