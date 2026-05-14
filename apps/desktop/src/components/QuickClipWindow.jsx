import { useEffect, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import QuickClipOverlay from './QuickClipOverlay.jsx';
import {
  getCachedUser,
  loadSettings,
  openAuthUrl,
  postAnnotation,
  saveAnnotation,
} from '../lib/localStore.js';

function payloadFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('payload');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function QuickClipWindow() {
  const [payload, setPayload] = useState(payloadFromLocation());
  const [authUser, setAuthUser] = useState(getCachedUser());
  const [settings, setSettings] = useState({});
  const quote = payload?.quote || '';

  useEffect(() => {
    document.documentElement.classList.add('quick-composer-root');
    document.body.classList.add('quick-composer-body');
    loadSettings().then(setSettings).catch(() => {});

    let unlisten = null;
    listen('desktop-quick-annotation-payload', (event) => {
      setPayload(event.payload || null);
      setAuthUser(getCachedUser());
    }).then((value) => {
      unlisten = value;
    }).catch(() => {});

    return () => {
      document.documentElement.classList.remove('quick-composer-root');
      document.body.classList.remove('quick-composer-body');
      if (typeof unlisten === 'function') unlisten();
    };
  }, []);

  async function closeWindow() {
    try {
      await getCurrentWindow().close();
    } catch {
      // The detached window may already be gone.
    }
  }

  async function saveQuickClip(item, publishNow = false) {
    const saved = await saveAnnotation(item);
    if (publishNow) await postAnnotation(saved.id);
    await emit('desktop-annotation-saved', saved);
    return saved;
  }

  async function signIn(provider) {
    await openAuthUrl(provider, settings);
  }

  if (!quote) {
    return (
      <main className="desktop-quick-window-shell">
        <section className="desktop-quick-card">
          <header className="desktop-quick-header">
            <div>
              <p>Desktop clip</p>
              <h2>No selection found</h2>
            </div>
            <button className="desktop-quick-close" type="button" onClick={closeWindow}>
              Close
            </button>
          </header>
        </section>
      </main>
    );
  }

  return (
    <QuickClipOverlay
      quote={quote}
      sourceContext={payload?.source}
      windowMode
      authUser={authUser}
      onClose={closeWindow}
      onSave={saveQuickClip}
      onSignIn={signIn}
    />
  );
}
