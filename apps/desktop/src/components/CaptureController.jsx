import { useEffect, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cancelScreenClip, openCapturePermissions, startScreenClip, stopScreenClip } from '../lib/localStore.js';

const RECORDING_WAVE_DELAYS = [-1, -0.85, -0.7, -0.55, -0.4, -0.25, -0.1, -0.25, -0.4, -0.55, -0.7, -0.85, -1];

function formatTimer(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function captureErrorMessage(message) {
  const value = String(message || '');
  if (/TCC|declined|screen.?recording|application, window, display capture/i.test(value)) {
    return 'macOS screen recording permission is required. Enable Annotated in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen the app.';
  }
  if (/microphone/i.test(value)) {
    return 'Microphone permission is required for mic capture. Enable it in System Settings > Privacy & Security > Microphone, or turn Microphone off for this clip.';
  }
  if (/did not produce a playable file|produce a file/i.test(value)) {
    return 'Screen capture did not produce a playable file. Check Screen & System Audio Recording permissions, then restart Annotated.';
  }
  return value || 'Could not start screen capture';
}

function isNoActiveCaptureError(error) {
  return /no active screen capture/i.test(String(error?.message || error || ''));
}

function permissionKindFromMessage(message) {
  return /microphone/i.test(String(message || '')) ? 'microphone' : 'screen';
}

function isPermissionMessage(message) {
  return /permission|privacy|screen recording|microphone|TCC|declined/i.test(String(message || ''));
}

export default function CaptureController() {
  const [captureStatus, setCaptureStatus] = useState({ active: false, durationSeconds: 90 });
  const [captureNow, setCaptureNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('capture-controller-root');
    document.body.classList.add('capture-controller-body');
    let cancelled = false;

    async function begin() {
      setBusy(true);
      setError('');
      try {
        const status = await startScreenClip({
          durationSeconds: 90,
          microphone: true,
          systemAudio: true,
          displayIndex: 0,
        });
        if (cancelled) {
          await cancelScreenClip().catch(() => {});
          await emit('desktop-screen-clip-cancelled', true);
          return;
        }
        setCaptureNow(Date.now());
        setCaptureStatus(status);
        await emit('desktop-detached-screen-clip-started', status);
      } catch (err) {
        const message = captureErrorMessage(err?.message || err);
        setError(message);
        if (isPermissionMessage(message)) {
          await openCapturePermissions(permissionKindFromMessage(message)).catch(() => {});
        }
        setCaptureStatus((value) => ({ ...value, active: false }));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void begin();
    return () => {
      cancelled = true;
      document.documentElement.classList.remove('capture-controller-root');
      document.body.classList.remove('capture-controller-body');
    };
  }, []);

  useEffect(() => {
    if (!captureStatus.active) return undefined;
    const intervalId = window.setInterval(() => setCaptureNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [captureStatus.active]);

  useEffect(() => {
    let unlisten = null;
    listen('desktop-screen-clip-shortcut-cancel', () => {
      void cancel();
    }).then((value) => {
      unlisten = value;
    }).catch(() => {});
    return () => {
      if (typeof unlisten === 'function') unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureStatus.active, busy]);

  async function closeWindow() {
    try {
      await getCurrentWindow().close();
    } catch {
      // The controller window may already be closing.
    }
  }

  async function stop() {
    if (busy || !captureStatus.active) {
      await closeWindow();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await stopScreenClip();
      if (!result?.ok || !result.outputPath) {
        throw new Error(result?.error || 'Screen capture did not produce a playable file.');
      }
      await emit('desktop-screen-clip-finished', result);
      await closeWindow();
    } catch (err) {
      if (isNoActiveCaptureError(err)) {
        setCaptureStatus((value) => ({ ...value, active: false }));
        await emit('desktop-screen-clip-cancelled', true);
        await closeWindow();
        return;
      }
      setCaptureStatus((value) => ({ ...value, active: false }));
      const message = captureErrorMessage(err?.message || err || 'Could not stop screen capture');
      setError(message);
      if (isPermissionMessage(message)) {
        await openCapturePermissions(permissionKindFromMessage(message)).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy || !captureStatus.active) {
      await cancelScreenClip().catch(() => {});
      await emit('desktop-screen-clip-cancelled', true);
      await closeWindow();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await cancelScreenClip();
      await emit('desktop-screen-clip-cancelled', true);
      await closeWindow();
    } catch (err) {
      if (isNoActiveCaptureError(err)) {
        setCaptureStatus((value) => ({ ...value, active: false }));
        await emit('desktop-screen-clip-cancelled', true);
        await closeWindow();
        return;
      }
      const message = captureErrorMessage(err?.message || err || 'Could not cancel screen capture');
      setError(message);
      if (isPermissionMessage(message)) {
        await openCapturePermissions(permissionKindFromMessage(message)).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  const duration = Math.max(1, Number(captureStatus.durationSeconds) || 90);
  const startedAt = Date.parse(captureStatus.startedAt || '') || (captureNow - (Number(captureStatus.elapsedSeconds) || 0) * 1000);
  const elapsed = captureStatus.active ? Math.max(Number(captureStatus.elapsedSeconds) || 0, (captureNow - startedAt) / 1000) : 0;
  const remaining = Math.max(0, duration - elapsed);

  useEffect(() => {
    if (!captureStatus.active || remaining > 0 || busy) return undefined;
    void stop();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureStatus.active, remaining, busy]);

  return (
    <main className="capture-controller-shell">
      <section className="recording-popup capture-controller-card" aria-label="Screen clip recording">
        <div className="recording-popup__head">
          <div className="recording-popup__badge">
            <span className="recording-popup__dot" aria-hidden="true" />
            <span>{captureStatus.active ? 'Recording' : 'Starting'}</span>
          </div>
          <span className="recording-popup__source">Screen clip</span>
        </div>
        <div className="recording-popup__timer-block">
          <span className={`recording-popup__time ${remaining <= 10 ? 'warn' : ''}`}>{formatTimer(remaining)}</span>
          <span className="recording-popup__meta">remaining of 90 seconds</span>
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
          <div className="recording-popup__actions">
            <button className="recording-popup__cancel" type="button" onClick={cancel}>
              {captureStatus.active ? 'Cancel' : 'Close'}
            </button>
            <button className="recording-popup__stop" type="button" onClick={stop} disabled={busy || !captureStatus.active}>
              <span className="recording-popup__stop-icon" aria-hidden="true" />
              <span>Stop</span>
            </button>
          </div>
        </div>
        {error && (
          <div className="recording-popup__error">
            <p className="composer-error">{error}</p>
            {isPermissionMessage(error) && (
              <button className="recording-popup__permission" type="button" onClick={() => openCapturePermissions(permissionKindFromMessage(error))}>
                Open permissions
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
