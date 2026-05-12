import { useEffect, useMemo, useState } from 'react';
import { detectSource, parseTags } from '../lib/detect.js';
import SourceType from './SourceType.jsx';

const emptyDraft = {
  source_url: '',
  source_type: 'article',
  source_title: '',
  source_domain: '',
  source_thumbnail: '',
  clip_text: '',
  clip_start_sec: '',
  clip_end_sec: '',
  commentary: '',
  annotation_type: 'Opinion',
  tags: [],
  is_public: 0,
};

const annotationTypes = ['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking'];
const sourceModes = [
  { key: 'article', label: 'Article' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'podcast', label: 'Podcast' },
  { key: 'twitter', label: 'X' },
  { key: 'screen', label: 'Screen' },
];
const MAX_COMMENTARY_LENGTH = 360;

export default function Composer({ editing, authUser, onSave, onPost, onSignIn }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [tagText, setTagText] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(editing || emptyDraft);
    setTagText((editing?.tags || []).join(', '));
    setVisibility(editing?.is_public ? 'public' : 'private');
    setError('');
  }, [editing]);

  const detected = useMemo(() => detectSource(draft.source_url), [draft.source_url]);
  const isMedia = ['youtube', 'podcast'].includes(draft.source_type);
  const isScreen = draft.source_type === 'screen';

  function applyDetection() {
    if (!detected) return;
    setDraft((value) => ({ ...value, ...detected }));
  }

  function chooseSourceMode(sourceType) {
    if (sourceType === 'screen') {
      setDraft((value) => ({
        ...value,
        source_type: 'screen',
        source_url: 'screen://local',
        source_title: value.source_title || 'Screen clip',
        source_domain: 'Local screen',
        clip_text: value.clip_text || '',
      }));
      return;
    }
    setDraft((value) => ({
      ...value,
      source_type: sourceType,
      source_url: value.source_url === 'screen://local' ? '' : value.source_url,
      source_title: value.source_type === 'screen' ? '' : value.source_title,
      source_domain: value.source_type === 'screen' ? '' : value.source_domain,
    }));
  }

  async function save() {
    setError('');
    const normalizedDraft = detected && !isScreen
      ? { ...draft, ...detected }
      : draft;
    const payload = {
      ...normalizedDraft,
      tags: parseTags(tagText),
      is_public: 0,
      clip_start_sec: normalizedDraft.clip_start_sec === '' ? null : Number(normalizedDraft.clip_start_sec),
      clip_end_sec: normalizedDraft.clip_end_sec === '' ? null : Number(normalizedDraft.clip_end_sec),
      commentary: normalizedDraft.commentary.trim(),
    };

    try {
      const saved = await onSave(payload);
      if (visibility === 'public') await onPost(saved.id);
      if (!editing) {
        setDraft(emptyDraft);
        setTagText('');
        setVisibility('private');
      }
    } catch (err) {
      setError(err.message || 'Could not save annotation');
    }
  }

  const canSave = Boolean(draft.source_url && draft.commentary.trim() && draft.commentary.length <= MAX_COMMENTARY_LENGTH);

  return (
    <section className="composer-panel" aria-label="Annotation composer">
      <header className="composer-toolbar">
        <div>
          <p>Annotation Composer</p>
          <h1>Clip privately. Publish only when it belongs in the feed.</h1>
        </div>
        <kbd>⌘⇧A</kbd>
      </header>

      <label>
        Source
        <div className="source-mode-grid" role="radiogroup" aria-label="Source type">
          {sourceModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className={draft.source_type === mode.key ? 'active' : ''}
              onClick={() => chooseSourceMode(mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </label>

      {!isScreen ? (
        <div className="detect-row">
          <input
            value={draft.source_url}
            onChange={(event) => setDraft({ ...draft, source_url: event.target.value })}
            placeholder="Paste an article, YouTube, podcast, Spotify, or X link"
          />
          <button className="button button-outline" onClick={applyDetection} disabled={!detected}>Detect</button>
        </div>
      ) : (
        <div className="screen-capture-note">
          <strong>Screen clipping scaffold</strong>
          <span>Native capture needs macOS screen-recording permission and a Tauri capture backend. For now this saves the annotation privately with screen context.</span>
        </div>
      )}

      {draft.source_domain && (
        <p className="detected-source">
          <SourceType type={draft.source_type} />
          <strong>{draft.source_title}</strong>
          <span>{draft.source_domain}</span>
        </p>
      )}

      <label>
        {isScreen ? 'Screen context' : isMedia ? 'Clip note' : 'Clip text'}
        <textarea
          className="quote-input"
          value={draft.clip_text || ''}
          onChange={(event) => setDraft({ ...draft, clip_text: event.target.value })}
          placeholder={isScreen ? 'Describe what is on screen, or paste OCR text for a book/PDF clip...' : isMedia ? 'Optional note about the selected moment...' : 'Paste the passage you want to annotate...'}
        />
      </label>

      {isMedia && (
        <div className="time-fields">
          <label>
            Start
            <input type="number" min="0" value={draft.clip_start_sec ?? ''} onChange={(event) => setDraft({ ...draft, clip_start_sec: event.target.value })} />
          </label>
          <label>
            End
            <input type="number" min="0" value={draft.clip_end_sec ?? ''} onChange={(event) => setDraft({ ...draft, clip_end_sec: event.target.value })} />
          </label>
        </div>
      )}

      <label>
        Commentary
        <textarea
          className="commentary-input"
          maxLength={MAX_COMMENTARY_LENGTH}
          value={draft.commentary}
          onChange={(event) => setDraft({ ...draft, commentary: event.target.value })}
          placeholder="Write the argument in a couple of sentences..."
        />
        <small className="field-counter">{draft.commentary.length}/{MAX_COMMENTARY_LENGTH}</small>
      </label>

      <label>
        Annotation type
        <div className="tag-picker" role="radiogroup" aria-label="Annotation type">
          {annotationTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={draft.annotation_type === type ? 'active' : ''}
              onClick={() => setDraft({ ...draft, annotation_type: type })}
            >
              {type}
            </button>
          ))}
        </div>
      </label>

      <label>
        Tags
        <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="economy, ai, research" />
      </label>

      {error && <p className="composer-error">{error}</p>}

      <footer className="composer-actions">
        {visibility === 'public' && !authUser && (
          <button className="button button-outline" onClick={() => onSignIn?.('google')} type="button">Sign in first</button>
        )}
        <button className="button button-solid" onClick={save} disabled={!canSave || (visibility === 'public' && !authUser)}>
          {visibility === 'public' ? 'Publish Public' : 'Save Private'}
        </button>
      </footer>

      <div className="visibility-bubble" role="radiogroup" aria-label="Desktop annotation visibility">
        <button className={visibility === 'private' ? 'active' : ''} onClick={() => setVisibility('private')} type="button">Private</button>
        <button className={visibility === 'public' ? 'active' : ''} onClick={() => setVisibility('public')} type="button">Public</button>
      </div>
    </section>
  );
}
