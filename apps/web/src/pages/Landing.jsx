import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AuthButtons from '../components/AuthButtons.jsx';
import { getToken, getUsername } from '../lib/api.js';

const productNotes = [
  {
    label: 'Articles',
    copy: 'Highlight the exact passage that matters and attach your commentary to the source.',
  },
  {
    label: 'Video',
    copy: 'Clip YouTube moments with timestamps so readers can replay the context.',
  },
  {
    label: 'Podcasts',
    copy: 'Capture the part of an episode you want to discuss, then publish it into the feed.',
  },
  {
    label: 'Desktop',
    copy: 'Use the Mac app for private clips and screen capture outside the browser.',
  },
];

export default function Landing() {
  const [username, setUsername] = useState('');

  useEffect(() => {
    setUsername(getToken() ? getUsername() || 'demo' : '');
  }, []);

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <Link className="wordmark" to="/">annotated</Link>
        <nav aria-label="Public navigation">
          <Link to="/feed">Feed</Link>
          {username ? <Link to={`/u/${username}`}>@{username}</Link> : <Link to="/login">Log in</Link>}
        </nav>
      </header>

      <main className="landing-main" aria-labelledby="landing-title">
        <img className="landing-hero-image" src="/annotated-app-logo.png" alt="" />
        <section className="landing-hero">
          <div className="landing-kicker">Annotated</div>
          <h1 id="landing-title">Clip the internet. Publish the argument.</h1>
          <p>
            Quote articles, videos, podcasts and desktop moments with the original source attached, then discuss the annotation in a public feed built for context.
          </p>
          <div className="landing-auth">
            {username ? (
              <Link className="button button-solid" to="/feed">Open feed</Link>
            ) : (
              <AuthButtons />
            )}
            <span>{username ? `Signed in as @${username}.` : 'Sign up or log in with Google or X.'}</span>
          </div>
        </section>
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
