import { useEffect, useRef, useState } from 'react';

const annotationTypes = ['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking'];
const MAX_COMMENTARY_LENGTH = 360;

function normalizeQuote(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2200);
}

export default function QuickClipOverlay({
  quote,
  sourceContext,
  windowMode = false,
  authUser,
  onClose,
  onSave,
  onSignIn,
  onStatus,
}) {
  const [commentary, setCommentary] = useState('');
  const [annotationType, setAnnotationType] = useState('Opinion');
  const [visibility, setVisibility] = useState('private');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const cleanedQuote = normalizeQuote(quote);
  const sourceTitle = sourceContext?.sourceTitle || sourceContext?.windowTitle || 'Desktop selection';
  const sourceDomain = sourceContext?.sourceDomain || sourceContext?.appName || 'Selected text';
  const sourceUrl = sourceContext?.sourceUrl || 'screen://selection';
  const sourceType = ['youtube', 'podcast', 'twitter'].includes(sourceContext?.sourceType)
    ? sourceContext.sourceType
    : 'article';

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function submit() {
    if (!commentary.trim() || saving) return;
    if (visibility === 'public' && !authUser) {
      onSignIn?.('google');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        user_id: authUser?.id || 'local-user',
        source_url: sourceUrl,
        source_type: sourceType,
        source_title: sourceTitle,
        source_domain: sourceDomain,
        source_thumbnail: '',
        clip_text: cleanedQuote,
        clip_start_sec: null,
        clip_end_sec: null,
        clip_media_path: '',
        commentary: commentary.trim(),
        annotation_type: annotationType,
        tags: [],
        is_public: visibility === 'public' ? 1 : 0,
      }, visibility === 'public');
      onStatus?.(visibility === 'public' ? 'Selection published' : 'Selection saved privately');
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save selection');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className={windowMode ? 'desktop-quick-window-shell' : 'desktop-quick-overlay'} role="presentation">
      <section className="desktop-quick-card" aria-label="Quick annotation">
        <header className="desktop-quick-header">
          <div>
            <p>{sourceDomain}</p>
            <h2>Annotate selection</h2>
          </div>
          <button className="desktop-quick-close" type="button" onClick={onClose} aria-label="Cancel quick annotation">
            Cancel
          </button>
        </header>

        <div className="desktop-quick-types" role="radiogroup" aria-label="Annotation type">
          {annotationTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={annotationType === type ? 'active' : ''}
              onClick={() => setAnnotationType(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <blockquote className="desktop-quick-quote">{cleanedQuote}</blockquote>

        <textarea
          ref={textareaRef}
          className="desktop-quick-textarea"
          value={commentary}
          onChange={(event) => setCommentary(event.target.value.slice(0, MAX_COMMENTARY_LENGTH))}
          onKeyDown={handleKeyDown}
          maxLength={MAX_COMMENTARY_LENGTH}
          rows={5}
          placeholder="Write your annotation..."
        />

        <footer className="desktop-quick-actions">
          <div className="desktop-quick-visibility" role="radiogroup" aria-label="Visibility">
            <button className={visibility === 'private' ? 'active' : ''} type="button" onClick={() => setVisibility('private')}>
              Private
            </button>
            <button className={visibility === 'public' ? 'active' : ''} type="button" onClick={() => setVisibility('public')}>
              Public
            </button>
          </div>
          <span className="desktop-quick-counter">{commentary.length}/{MAX_COMMENTARY_LENGTH}</span>
          <button
            className="desktop-quick-submit"
            type="button"
            onClick={submit}
            disabled={!commentary.trim() || saving || (visibility === 'public' && !authUser)}
          >
            Annotate
          </button>
        </footer>
        {visibility === 'public' && !authUser && (
          <button className="desktop-quick-signin" type="button" onClick={() => onSignIn?.('google')}>
            Sign in before publishing public annotations
          </button>
        )}
        {error && <p className="composer-error">{error}</p>}
      </section>
    </div>
  );
}
