import { useEffect, useMemo, useState } from 'react';
import { detectSource, parseTags } from '../lib/detect.js';
import { extractPodcastAudio, mediaSrc, startScreenClip, stopScreenClip } from '../lib/localStore.js';
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
const RECORDING_WAVE_DELAYS = [-1, -0.85, -0.7, -0.55, -0.4, -0.25, -0.1, -0.25, -0.4, -0.55, -0.7, -0.85, -1];

function formatTimer(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function RecordingTimer({ remaining, onStop, disabled }) {
  return (
    <section className="recording-popup" aria-label="Screen clip recording">
      <div className="recording-popup__head">
        <div className="recording-popup__badge">
          <span className="recording-popup__dot" aria-hidden="true" />
          <span>Recording</span>
        </div>
        <span className="recording-popup__source">Screen clip</span>
      </div>
      <div className="recording-popup__timer-block">
        <span className={`recording-popup__time ${remaining <= 10 ? 'warn' : ''}`}>{formatTimer(remaining)}</span>
        <span className="recording-popup__meta">remaining</span>
      </div>
      <div className="recording-popup__wave" aria-hidden="true">
        {RECORDING_WAVE_DELAYS.map((delay, index) => (
          <i key={`${delay}-${index}`} style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>
      <div className="recording-popup__footer">
        <div className="recording-popup__hint">
          <span>or press</span>
          <span className="recording-popup__keys" aria-label="Option Shift X">
            <span className="recording-popup__key">⌥</span>
            <span className="recording-popup__key">⇧</span>
            <span className="recording-popup__key">X</span>
          </span>
        </div>
        <button className="recording-popup__stop" type="button" onClick={onStop} disabled={disabled} aria-label="Stop recording">
          <span className="recording-popup__stop-icon" aria-hidden="true" />
          <span>Stop</span>
        </button>
      </div>
    </section>
  );
}

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
  const [podcastBusy, setPodcastBusy] = useState(false);
  const [podcastError, setPodcastError] = useState('');
  const [captureNow, setCaptureNow] = useState(Date.now());

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
  const attachedPodcastClip = draft.source_type === 'podcast' && draft.clip_media_path ? mediaSrc(draft.clip_media_path) : '';

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

  useEffect(() => {
    if (!captureStatus.active) return undefined;
    setCaptureNow(Date.now());
    const intervalId = window.setInterval(() => setCaptureNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [captureStatus.active, captureStatus.startedAt]);

  function applyDetection() {
    if (!detected) return;
    setPodcastError('');
    setDraft((value) => ({
      ...value,
      ...detected,
      clip_media_path: detected.source_type === value.source_type ? value.clip_media_path : '',
    }));
  }

  function chooseSourceMode(sourceType) {
    setPodcastError('');
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
      clip_media_path: value.source_type === sourceType ? value.clip_media_path : '',
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

  async function extractPodcastClip() {
    if (draft.source_type !== 'podcast' || podcastBusy) return;
    const url = draft.source_url.trim();
    const startSec = Math.max(0, Number(draft.clip_start_sec) || 0);
    const endSec = Math.max(startSec + 1, Math.min(Number(draft.clip_end_sec) || startSec + 90, startSec + 90));
    if (!url) {
      setPodcastError('Paste a podcast, Spotify, Apple Podcasts, or direct audio link first.');
      return;
    }

    setPodcastBusy(true);
    setPodcastError('');
    onStatus?.('Extracting podcast audio...');
    try {
      const clip = await extractPodcastAudio({ url, start: startSec, end: endSec });
      const mediaPath = clip.localPath || clip.mediaPath || clip.clip_media_path;
      setDraft((value) => ({
        ...value,
        clip_media_path: mediaPath || value.clip_media_path,
        clip_start_sec: clip.startSec ?? startSec,
        clip_end_sec: clip.endSec ?? endSec,
        source_title: clip.title || value.source_title,
        clip_text: value.clip_text || `Audio excerpt attached (${Math.round(clip.duration || endSec - startSec)}s).`,
      }));
      onStatus?.('Podcast clip attached');
    } catch (err) {
      setPodcastError(err.message || 'Could not extract podcast audio.');
      onStatus?.('Podcast extraction failed');
    } finally {
      setPodcastBusy(false);
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
  const captureDuration = Math.max(1, Number(captureStatus.durationSeconds) || 90);
  const captureStartedAt = Date.parse(captureStatus.startedAt || '') || (captureNow - (Number(captureStatus.elapsedSeconds) || 0) * 1000);
  const captureElapsed = captureStatus.active ? Math.max(Number(captureStatus.elapsedSeconds) || 0, (captureNow - captureStartedAt) / 1000) : 0;
  const captureRemaining = Math.max(0, captureDuration - captureElapsed);

  return (
    <section className="composer-panel" aria-label="Annotation composer">
      <header className="composer-toolbar">
        <div>
          <p>Annotation Composer</p>
          <h1>Clip privately. Publish only when it belongs in the feed.</h1>
        </div>
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
          {captureStatus.active ? (
            <RecordingTimer remaining={captureRemaining} onStop={finishScreenCapture} disabled={captureBusy} />
          ) : (
            <div className="capture-actions">
              <button className="button button-solid" type="button" onClick={beginScreenCapture} disabled={captureBusy}>
                Start Capture
              </button>
              <p className="capture-state">
                {draft.clip_media_path ? 'Clip attached' : 'Ready to capture'}
              </p>
            </div>
          )}
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
        <div className="media-clip-panel">
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
          {draft.source_type === 'podcast' && (
            <div className="media-extract-row">
              <button className="button button-outline" type="button" onClick={extractPodcastClip} disabled={podcastBusy || !draft.source_url.trim()}>
                {podcastBusy ? 'Extracting Audio' : attachedPodcastClip ? 'Re-extract Audio' : 'Extract Audio'}
              </button>
              <span>{attachedPodcastClip ? 'Audio attached locally.' : 'Extracts up to 90 seconds for private preview and public upload.'}</span>
            </div>
          )}
          {attachedPodcastClip && (
            <audio className="audio-player" controls preload="metadata" src={attachedPodcastClip} />
          )}
          {podcastError && <p className="composer-error">{podcastError}</p>}
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

      <div className="visibility-bubble" role="radiogroup" aria-label="Desktop annotation visibility">
        <button className={visibility === 'private' ? 'active' : ''} onClick={() => setVisibility('private')} type="button">Private</button>
        <button className={visibility === 'public' ? 'active' : ''} onClick={() => setVisibility('public')} type="button">Public</button>
      </div>

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
    </section>
  );
}
