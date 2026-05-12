import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuoteAnnotationBubble from '../components/QuoteAnnotationBubble.jsx';
import SourceType from '../components/SourceType.jsx';
import {
  createAnnotation,
  createMediaClip,
  detectClip,
  getCurrentUserId,
  getUsername,
} from '../lib/api.js';
import { domainFromUrl, formatTime } from '../lib/format.js';

const steps = ['Link', 'Clip', 'Commentary', 'Post'];
const annotationTypes = ['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking'];
const MAX_COMMENTARY_LENGTH = 360;

export default function NewAnnotation() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState(null);
  const [clipText, setClipText] = useState('');
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(90);
  const [commentary, setCommentary] = useState('');
  const [annotationType, setAnnotationType] = useState('Opinion');
  const [detecting, setDetecting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingAction, setPostingAction] = useState('');
  const [clipping, setClipping] = useState(false);
  const [error, setError] = useState('');
  const isMediaSource = detected && ['youtube', 'podcast'].includes(detected.type);

  const activeStep = useMemo(() => {
    if (!detected) return 0;
    if (!['youtube', 'podcast'].includes(detected.type) && !clipText.trim()) return 1;
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
        thumbnail: data.thumbnail || data.source_thumbnail || '',
        siteName: data.siteName || data.source_site_name || '',
        author: data.author || data.source_author || '',
        publishedAt: data.publishedAt || data.source_published_at || '',
      });
      if (data.excerpt) setClipText(data.excerpt);
    } catch {
      setDetected({ type: inferType(value), title: 'Detected source', domain: domainFromUrl(value) });
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

  async function submit(event, requestedStatus = 'published') {
    event?.preventDefault?.();
    if (!detected) return setError('Detect a source first.');
    if (!['youtube', 'podcast'].includes(detected.type) && !clipText.trim()) return setError('Add the quoted passage.');
    if (!commentary.trim()) return setError('Write your commentary.');
    setPosting(true);
    setPostingAction(requestedStatus);
    setClipping(false);
    setError('');
    try {
      let mediaClip = null;
      if (isMediaSource) {
        setClipping(true);
        try {
          mediaClip = await createMediaClip({
            type: detected.type,
            url: url.trim(),
            start: clipStart,
            end: clipEnd,
          });
        } catch {
          mediaClip = null;
        } finally {
          setClipping(false);
        }
      }

      const data = await createAnnotation({
        source_url: url.trim(),
        source_type: detected.type,
        source_title: mediaClip?.title || detected.title,
        source_domain: detected.domain,
        source_site_name: detected.siteName || null,
        source_author: detected.author || null,
        source_published_at: detected.publishedAt || null,
        source_thumbnail: mediaClip?.thumbnail || detected.thumbnail || null,
        clip_text: isMediaSource ? null : clipText.trim(),
        clip_start_sec: isMediaSource ? (mediaClip?.startSec ?? clipStart) : null,
        clip_end_sec: isMediaSource ? (mediaClip?.endSec ?? clipEnd) : null,
        clip_media_path: mediaClip?.mediaPath || null,
        commentary: commentary.trim(),
        annotation_type: annotationType,
        status: requestedStatus,
      });
      if (data.status === 'draft') {
        navigate(`/u/${getUsername() || getCurrentUserId()}?tab=drafts`);
      } else {
        navigate(`/a/${data.id}`);
      }
    } catch (err) {
      setError(err.message || 'Could not post yet. Check the API and try again.');
    } finally {
      setPosting(false);
      setPostingAction('');
    }
  }

  function postControls() {
    const disabled = posting || activeStep < 3;

    return (
      <div className="publish-controls">
        <button
          className="annotate-submit-button"
          type="button"
          onClick={(event) => submit(event, 'published')}
          disabled={disabled}
        >
          {clipping && postingAction === 'published' ? 'Clipping media' : posting && postingAction === 'published' ? 'Annotating' : 'Annotate'}
        </button>
      </div>
    );
  }

  return (
    <div className="page new-page">
      <header className="editor-heading">
        <p>New annotation</p>
        <h1>Paste an article, YouTube, podcast, Spotify, or X link.</h1>
      </header>

      <ol className="step-list">
        {steps.map((step, index) => (
          <li key={step} className={index <= activeStep ? 'active' : ''}>{step}</li>
        ))}
      </ol>

      <form className="editor-form" onSubmit={(event) => submit(event, 'published')}>
        <section className="form-section">
          <label htmlFor="source-url">Source link</label>
          <div className="detect-row">
            <input
              id="source-url"
              className="field mono-field"
              type="url"
              placeholder="Article, YouTube, podcast, Spotify, or X URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !detected) detect(event);
              }}
            />
            <button className="button button-outline" type="button" onClick={detect} disabled={detecting || !url.trim()}>
              {detecting ? 'Detecting' : 'Detect'}
            </button>
          </div>
        </section>

        {detected && (
          <section className="form-section">
            <label>Clip</label>
            <p className="detected-line">
              <SourceType type={detected.type} /> <strong>{detected.title}</strong> <span>{detected.domain}</span>
            </p>
            {!isMediaSource ? (
              <textarea className="field quote-field" placeholder="Paste the highlighted passage..." value={clipText} onChange={(event) => setClipText(event.target.value)} />
            ) : (
              <div className="time-grid">
                <label>
                  Start
                  <input className="field" type="number" min="0" value={clipStart} onChange={(event) => updateStart(event.target.value)} />
                  <span>{formatTime(clipStart)}</span>
                </label>
                <label>
                  End
                  <input className="field" type="number" min="1" value={clipEnd} onChange={(event) => updateEnd(event.target.value)} />
                  <span>{formatTime(clipEnd)}</span>
                </label>
                <p>{clipEnd - clipStart}s selected · 90s max</p>
              </div>
            )}
          </section>
        )}

        {detected && (
          <section className="form-section">
            <label htmlFor="commentary">Commentary</label>
            <div className="tag-picker compact" aria-label="Annotation type">
              {annotationTypes.map((type) => (
                <button key={type} type="button" className={annotationType === type ? 'active' : ''} onClick={() => setAnnotationType(type)}>
                  {type}
                </button>
              ))}
            </div>
            {!isMediaSource && clipText.trim() ? (
              <QuoteAnnotationBubble
                quote={`“${clipText.trim()}”`}
                value={commentary}
                onChange={setCommentary}
                placeholder="Write the take people should respond to..."
                maxLength={MAX_COMMENTARY_LENGTH}
                disabled={posting || activeStep < 3}
                textareaId="commentary"
                actions={postControls()}
              />
            ) : (
              <>
                <textarea
                  id="commentary"
                  className="field commentary-field"
                  placeholder="Write the take people should respond to..."
                  value={commentary}
                  maxLength={MAX_COMMENTARY_LENGTH}
                  onChange={(event) => setCommentary(event.target.value)}
                />
                <small className="field-counter">{commentary.length}/{MAX_COMMENTARY_LENGTH}</small>
              </>
            )}
          </section>
        )}

        {error && <p className="notice error">{error}</p>}

        {detected && !(!isMediaSource && clipText.trim()) && (
          postControls()
        )}
      </form>
    </div>
  );
}

function inferType(value) {
  if (/youtube\.com|youtu\.be/i.test(value)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(value)) return 'twitter';
  if (/podcast|spotify|apple\.com\/.*podcast/i.test(value)) return 'podcast';
  return 'article';
}
