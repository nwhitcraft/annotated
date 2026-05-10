import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SourceBadge from '../components/SourceBadge.jsx';
import { createAnnotation, detectClip } from '../lib/api.js';
import { domainFromUrl, formatTime } from '../lib/format.js';

const stepLabels = ['URL', 'Clip', 'Commentary', 'Post'];

export default function NewAnnotation() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState(null);
  const [clipText, setClipText] = useState('');
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(60);
  const [commentary, setCommentary] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const activeStep = useMemo(() => {
    if (!detected) return 0;
    if (detected.type === 'article' && !clipText.trim()) return 1;
    if (['youtube', 'podcast'].includes(detected.type) && clipEnd <= clipStart) return 1;
    if (!commentary.trim()) return 2;
    return 3;
  }, [detected, clipText, clipStart, clipEnd, commentary]);

  async function detect(event) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setDetecting(true);
    setError('');
    try {
      const data = await detectClip(value);
      setDetected({
        type: data.type || inferType(value),
        title: data.title || data.source_title || 'Untitled source',
        domain: data.domain || domainFromUrl(value),
        excerpt: data.excerpt || '',
        thumbnail: data.thumbnail || data.source_thumbnail || '',
      });
      if (data.excerpt) setClipText(data.excerpt);
    } catch {
      setDetected({
        type: inferType(value),
        title: 'Detected source',
        domain: domainFromUrl(value),
        excerpt: '',
      });
    } finally {
      setDetecting(false);
    }
  }

  function updateStart(value) {
    const next = Math.max(0, Number(value) || 0);
    setClipStart(next);
    setClipEnd((end) => Math.min(Math.max(end, next + 1), next + 90));
  }

  function updateEnd(value) {
    const next = Math.max(0, Number(value) || 0);
    setClipEnd(Math.min(Math.max(next, clipStart + 1), clipStart + 90));
  }

  async function submit(event) {
    event.preventDefault();
    if (!detected) return setError('Detect a source first');
    if (detected.type === 'article' && !clipText.trim()) return setError('Add the highlighted passage');
    if (!commentary.trim()) return setError('Add your commentary');
    setPosting(true);
    setError('');
    try {
      const payload = {
        source_url: url.trim(),
        source_type: detected.type,
        source_title: detected.title,
        source_domain: detected.domain,
        source_thumbnail: detected.thumbnail || null,
        clip_text: detected.type === 'article' ? clipText.trim() : null,
        clip_start_sec: detected.type === 'article' ? null : clipStart,
        clip_end_sec: detected.type === 'article' ? null : clipEnd,
        commentary: commentary.trim(),
      };
      const data = await createAnnotation(payload);
      navigate(`/a/${data.id}`);
    } catch {
      setError('Could not post yet. Check that the API is running and try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="new-page page-wrap narrow-wrap">
      <section className="page-intro">
        <span className="eyebrow">Create annotation</span>
        <h1>Clip the exact moment that deserves a thread.</h1>
        <p>Start with a URL, choose the passage or time range, then write the take people can reply to.</p>
      </section>

      <div className="stepper" aria-label="Annotation progress">
        {stepLabels.map((label, index) => (
          <span key={label} className={index <= activeStep ? 'active' : ''}>
            <i>{index + 1}</i>
            {label}
          </span>
        ))}
      </div>

      <form className="composer" onSubmit={submit}>
        <section className="composer-panel">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <h2>Source URL</h2>
              <p>Paste an article, YouTube video, or podcast episode.</p>
            </div>
          </div>
          <div className="detect-row">
            <input
              className="field mono-field"
              type="url"
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !detected) detect(event);
              }}
            />
            <button className="btn btn-secondary" type="button" onClick={detect} disabled={detecting || !url.trim()}>
              {detecting ? 'Detecting' : 'Detect'}
            </button>
          </div>
        </section>

        {detected && (
          <section className="composer-panel">
            <div className="panel-heading">
              <span>02</span>
              <div>
                <h2>Clip</h2>
                <p>Keep it focused. Short excerpts make better conversations.</p>
              </div>
            </div>
            <div className="detected-source">
              <SourceBadge type={detected.type} />
              <strong>{detected.title}</strong>
              <span>{detected.domain}</span>
            </div>

            {detected.type === 'article' ? (
              <textarea
                className="field serif-field highlight-field"
                placeholder="Paste the passage you want to highlight..."
                value={clipText}
                onChange={(event) => setClipText(event.target.value)}
              />
            ) : (
              <div className="range-editor">
                <label>
                  <span>Start</span>
                  <input className="field" type="number" min="0" value={clipStart} onChange={(event) => updateStart(event.target.value)} />
                  <small>{formatTime(clipStart)}</small>
                </label>
                <label>
                  <span>End</span>
                  <input className="field" type="number" min="1" value={clipEnd} onChange={(event) => updateEnd(event.target.value)} />
                  <small>{formatTime(clipEnd)}</small>
                </label>
                <div className="range-duration">
                  <strong>{clipEnd - clipStart}s</strong>
                  <span>90s max</span>
                </div>
              </div>
            )}
          </section>
        )}

        {detected && (
          <section className="composer-panel commentary-panel">
            <div className="panel-heading">
              <span>03</span>
              <div>
                <h2>Your commentary</h2>
                <p>Write like you are opening the best reply thread on the internet.</p>
              </div>
            </div>
            <textarea
              className="field serif-field commentary-field"
              placeholder="What is the claim, tension, or insight people should react to?"
              value={commentary}
              onChange={(event) => setCommentary(event.target.value)}
            />
          </section>
        )}

        {error && <div className="notice notice-danger">{error}</div>}

        {detected && (
          <button className="btn btn-primary post-button" type="submit" disabled={posting || activeStep < 3}>
            {posting ? 'Posting annotation' : 'Post annotation'}
          </button>
        )}
      </form>
    </div>
  );
}

function inferType(value) {
  if (/youtube\.com|youtu\.be/i.test(value)) return 'youtube';
  if (/podcast|spotify|apple\.com\/.*podcast/i.test(value)) return 'podcast';
  return 'article';
}
