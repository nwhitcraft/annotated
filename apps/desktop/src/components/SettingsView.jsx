import { useState } from 'react';
import { runDesktopDiagnostics } from '../lib/localStore.js';

export default function SettingsView({ settings, authUser, onChange, onSave, onSignIn, onCallback, onSignOut }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [callbackValue, setCallbackValue] = useState('');
  const [authError, setAuthError] = useState('');

  async function runDiagnostics() {
    setDiagnostics(await runDesktopDiagnostics());
  }

  async function connectCallback() {
    setAuthError('');
    try {
      await onSave(settings);
      await onCallback(callbackValue);
      setCallbackValue('');
    } catch (error) {
      setAuthError(error.message || 'Could not connect account');
    }
  }

  return (
    <section className="settings-view">
      <header className="section-heading">
        <div>
          <p>Settings</p>
          <h2>Local workspace</h2>
        </div>
      </header>
      <section className="auth-card">
        <div>
          <p>Account</p>
          {authUser ? (
            <h3>{authUser.display_name || authUser.username} <span>@{authUser.username}</span></h3>
          ) : (
            <h3>Sign in to publish public annotations</h3>
          )}
        </div>
        <div className="auth-actions">
          <button className="button button-outline" type="button" onClick={() => onSignIn('google')}>Google</button>
          <button className="button button-outline" type="button" onClick={() => onSignIn('twitter')}>X</button>
        </div>
        <label>
          Desktop callback URL or token
          <input
            value={callbackValue}
            onChange={(event) => setCallbackValue(event.target.value)}
            placeholder="annotated://callback?token=..."
          />
        </label>
        <button className="button button-solid" type="button" onClick={connectCallback} disabled={!callbackValue.trim()}>
          Connect account
        </button>
        {authError && <p className="composer-error">{authError}</p>}
      </section>
      <label>
        API endpoint
        <input value={settings.apiEndpoint || ''} onChange={(event) => onChange({ ...settings, apiEndpoint: event.target.value })} />
      </label>
      <label>
        Web app URL
        <input value={settings.frontendUrl || ''} onChange={(event) => onChange({ ...settings, frontendUrl: event.target.value })} />
      </label>
      <label>
        Global hotkey
        <input value={settings.hotkey || ''} onChange={(event) => onChange({ ...settings, hotkey: event.target.value })} />
      </label>
      <label>
        Storage location
        <input value={settings.storageLocation || ''} onChange={(event) => onChange({ ...settings, storageLocation: event.target.value })} />
      </label>
      <p className="schema-note">
        Local schema mirrors the web API annotations, users, comments, likes, pins and follows tables, with synced_at and conflict_version on locally mutable records.
      </p>
      <div className="settings-actions">
        <button className="button button-solid" onClick={() => onSave(settings)}>Save settings</button>
        <button className="button button-outline" onClick={runDiagnostics}>Run desktop diagnostics</button>
      </div>
      <section className="settings-account">
        <div className="settings-divider" />
        <div>
          <p>Account</p>
          <h3>{authUser ? 'Signed in on this Mac' : 'No account connected'}</h3>
        </div>
        <p className="settings-account-note">
          Sign out clears the local session on this device. Private annotations and desktop settings remain on this Mac.
        </p>
        <button className="button button-text settings-sign-out" type="button" onClick={onSignOut} disabled={!authUser}>
          Sign out
        </button>
      </section>
      {diagnostics && (
        <div className="diagnostic-list">
          {Object.entries(diagnostics).map(([name, result]) => (
            <p key={name}>
              <strong>{name}</strong> {result.ok ? 'ready' : 'blocked'} {result.blocker || result.stdout || ''}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
