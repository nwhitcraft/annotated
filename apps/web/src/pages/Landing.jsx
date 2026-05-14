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

      <main className="landing-main landing-animated-hero" aria-labelledby="landing-title">
        <div className="hero-wrap">
          <div className="hero-stages" role="list">
            <div className="hero-stage" role="listitem">
              <h3>Thought?</h3>
              <div className="hero-figure">
                <div className="hero-bubble" aria-hidden="true">
                  <svg viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet">
                    <path className="hero-draw" pathLength="1" d="M70,55 C58,40 70,22 92,28 C96,14 122,12 132,26 C150,20 168,34 162,52 C178,54 184,76 168,86 C172,104 148,114 134,102 C124,116 96,114 90,98 C72,104 58,90 64,76 C48,72 50,52 70,55 Z" />
                    <circle className="hero-dot hero-dot-1" cx="80" cy="112" r="5" />
                    <circle className="hero-dot hero-dot-2" cx="70" cy="128" r="3" />
                  </svg>
                </div>
              </div>
              <p>Something stands out.<br />A thought begins.</p>
            </div>

            <div className="hero-arrow" aria-hidden="true">
              <svg viewBox="0 0 80 24" preserveAspectRatio="xMidYMid meet">
                <line className="hero-shaft" pathLength="1" x1="2" y1="12" x2="74" y2="12" />
                <path className="hero-head" d="M66,5 L76,12 L66,19" />
              </svg>
            </div>

            <div className="hero-stage" role="listitem">
              <h3>Clip it</h3>
              <div className="hero-figure">
                <div className="hero-card">
                  <span className="hero-quote-mark hero-quote-left">“</span>
                  <div className="hero-quote-text">A sentence can hold<br />a whole idea.</div>
                  <span className="hero-quote-mark hero-quote-right">“</span>
                </div>
              </div>
              <p>Capture the words<br />that matter.</p>
            </div>

            <div className="hero-arrow" aria-hidden="true">
              <svg viewBox="0 0 80 24" preserveAspectRatio="xMidYMid meet">
                <line className="hero-shaft" pathLength="1" x1="2" y1="12" x2="74" y2="12" />
                <path className="hero-head" d="M66,5 L76,12 L66,19" />
              </svg>
            </div>

            <div className="hero-stage" role="listitem">
              <h3>Comment</h3>
              <div className="hero-figure">
                <div className="hero-card">
                  <div className="hero-note-text">The best notes add<br />meaning, not noise.</div>
                </div>
              </div>
              <p>Add your perspective.<br />Join the discourse.</p>
            </div>
          </div>

          <div className="hero-divider" />

          <section className="hero-lockup" aria-labelledby="landing-title">
            <h1 id="landing-title" className="hero-brand" aria-label="annotated">
              {'annotated'.split('').map((char, index) => (
                <span className="hero-brand-char" style={{ animationDelay: `${1.72 + index * 0.055}s` }} key={`${char}-${index}`}>{char}</span>
              ))}
            </h1>
            <p className="hero-tagline">Become<span />Credible</p>
            <div className="hero-cta-row">
              {username ? (
                <Link className="hero-cta" to="/feed">Open feed</Link>
              ) : (
                <AuthButtons className="hero-auth-buttons" />
              )}
            </div>
          </section>
        </div>
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
