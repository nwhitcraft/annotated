import { useEffect, useMemo, useState } from 'react';
import { detectSource, parseTags } from '../lib/detect.js';
import { mediaSrc, startScreenClip, stopScreenClip } from '../lib/localStore.js';
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
  clip_media_path: '',
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

function captureErrorMessage(message) {
  const value = String(message || '');
  if (/TCC|declined|screen.?recording|application, window, display capture/i.test(value)) {
    return 'macOS screen recording permission is required. Open System Settings > Privacy & Security > Screen & System Audio Recording (or Screen Recording), enable Annotated/Terminal, then reopen the app.';
  }
  if (/microphone/i.test(value)) {
    return 'Microphone permission is required for mic capture. Enable it in System Settings > Privacy & Security > Microphone, or turn Microphone off for this clip.';
  }
  if (/did not produce a playable file|produce a file/i.test(value)) {
    return 'Screen capture did not produce a playable file. Check that Annotated and its capture helper are enabled in System Settings > Privacy & Security > Screen & System Audio Recording, then restart the app.';
  }
  return value || 'Screen capture failed';
}

export default function Composer({
  editing,
  authUser,
  onSave,
  onPost,
  onSignIn,
  screenCaptureIntent = 0,
  screenStopIntent = 0,
  onStatus,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [tagText, setTagText] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [error, setError] = useState('');
  const [captureStatus, setCaptureStatus] = useState({ active: false });
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [useMicrophone, setUseMicrophone] = useState(true);
  const [useSystemAudio, setUseSystemAudio] = useState(true);

  useEffect(() => {
    setDraft(editing || emptyDraft);
    setTagText((editing?.tags || []).join(', '));
    setVisibility(editing?.is_public ? 'public' : 'private');
    setError('');
  }, [editing]);

  const detected = useMemo(() => detectSource(draft.source_url), [draft.source_url]);
  const isMedia = ['youtube', 'podcast'].includes(draft.source_type);
  const isScreen = draft.source_type === 'screen';
  const attachedScreenClip = isScreen && draft.clip_media_path ? mediaSrc(draft.clip_media_path) : '';

  useEffect(() => {
    if (screenCaptureIntent > 0) {
      chooseSourceMode('screen');
      beginScreenCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenCaptureIntent]);

  useEffect(() => {
    if (screenStopIntent > 0) {
      finishScreenCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenStopIntent]);

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

  async function beginScreenCapture() {
    if (captureStatus.active || captureBusy) return;
    setCaptureError('');
    setCaptureBusy(true);
    onStatus?.('Starting screen clip...');
    setDraft((value) => ({
      ...value,
      source_type: 'screen',
      source_url: 'screen://local',
      source_title: value.source_title || 'Screen clip',
      source_domain: 'Local screen',
    }));
    try {
      const status = await startScreenClip({
        durationSeconds: 90,
        microphone: useMicrophone,
        systemAudio: useSystemAudio,
        displayIndex: 0,
      });
      setCaptureStatus(status);
      onStatus?.('Screen clip recording');
    } catch (err) {
      setCaptureError(captureErrorMessage(err.message || 'Could not start screen capture'));
      onStatus?.('Screen clip could not start');
    } finally {
      setCaptureBusy(false);
    }
  }

  async function finishScreenCapture() {
    if (!captureStatus.active || captureBusy) return;
    setCaptureError('');
    setCaptureBusy(true);
    onStatus?.('Saving screen clip...');
    try {
      const result = await stopScreenClip();
      setCaptureStatus({ active: false });
      if (!result.ok || !result.outputPath) {
        throw new Error(result.error || 'Screen capture did not produce a file.');
      }
      const duration = result.durationSeconds || 90;
      setDraft((value) => ({
        ...value,
        source_type: 'screen',
        source_url: 'screen://local',
        source_title: value.source_title || 'Screen clip',
        source_domain: 'Local screen',
        clip_media_path: result.outputPath,
        clip_start_sec: 0,
        clip_end_sec: duration,
        clip_text: value.clip_text || `Screen recording attached (${duration}s).`,
      }));
      onStatus?.('Screen clip attached');
    } catch (err) {
      setCaptureStatus({ active: false });
      setCaptureError(captureErrorMessage(err.message || 'Could not finish screen capture'));
      onStatus?.('Screen clip failed');
    } finally {
      setCaptureBusy(false);
    }
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
          <header>
            <strong>Screen capture</strong>
            <span>Record the current display for up to 90 seconds. Private clips stay on this Mac; Public uploads after posting.</span>
          </header>
          <div className="capture-toggles" aria-label="Capture layers">
            <label className="inline-check">
              <input type="checkbox" checked={useSystemAudio} disabled={captureStatus.active} onChange={(event) => setUseSystemAudio(event.target.checked)} />
              System audio
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={useMicrophone} disabled={captureStatus.active} onChange={(event) => setUseMicrophone(event.target.checked)} />
              Microphone
            </label>
          </div>
          <div className="capture-actions">
            <button className="button button-solid" type="button" onClick={beginScreenCapture} disabled={captureStatus.active || captureBusy}>
              Start Capture
            </button>
            <button className="button button-outline" type="button" onClick={finishScreenCapture} disabled={!captureStatus.active || captureBusy}>
              Stop & Attach
            </button>
          </div>
          <p className={`capture-state ${captureStatus.active ? 'recording' : ''}`}>
            {captureStatus.active ? 'Recording...' : draft.clip_media_path ? 'Clip attached' : 'Ready to capture'}
          </p>
          {attachedScreenClip && (
            <video className="screen-preview" controls preload="metadata" src={attachedScreenClip} />
          )}
          {captureError && <p className="composer-error">{captureError}</p>}
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
