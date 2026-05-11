import { Link } from 'react-router-dom';
import AuthButtons from '../components/AuthButtons.jsx';

const productNotes = [
  {
    label: 'Clip',
    copy: 'Save the exact passage, timestamp, or episode moment that deserves a public response.',
  },
  {
    label: 'Comment',
    copy: 'Write a clear take with the original source attached, so readers can inspect the argument.',
  },
  {
    label: 'Discuss',
    copy: 'Publish into a feed built around threaded commentary instead of disposable bookmarks.',
  },
];

export default function Landing() {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <Link className="wordmark" to="/">annotated</Link>
        <nav aria-label="Public navigation">
          <Link to="/feed">Feed</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-kicker">Social commentary for the open web</div>
          <h1 id="landing-title">Clip the internet. Publish the argument.</h1>
          <p>
            Annotated is a place to quote articles, videos, and podcasts with context, then discuss the take in a public thread.
          </p>
          <div className="landing-auth">
            <AuthButtons />
            <span>Sign up or log in with one click.</span>
          </div>
        </section>

        <aside className="landing-proof" aria-label="Annotated preview">
          <div className="proof-meta">MAYA DESAI · ft.com · article</div>
          <a href="/feed">Why the global economy keeps defying the pessimists</a>
          <blockquote>
            The resilience of consumer spending and the adaptability of businesses have changed the forecast.
          </blockquote>
          <h2>The useful layer is not the link. It is the argument attached to it.</h2>
          <div className="proof-actions">♡ 42 · ○ 8 · Share</div>
        </aside>
      </main>

      <section className="landing-notes" aria-label="How Annotated works">
        {productNotes.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <p>{item.copy}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
