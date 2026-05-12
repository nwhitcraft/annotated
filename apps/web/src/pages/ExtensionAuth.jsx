import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authUrl, getAvatarUrl, getToken, getUsername, hydrateCurrentUser } from '../lib/api.js';

export default function ExtensionAuth() {
  const [state, setState] = useState('checking');
  const [user, setUser] = useState({ username: getUsername(), avatar_url: getAvatarUrl() });

  useEffect(() => {
    let removeReadyListener = null;
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setState('needs-login');
      return;
    }

    hydrateCurrentUser()
      .then((profile) => {
        if (cancelled) return;
        setUser(profile);
        const sendAuth = () => {
          window.postMessage({ type: 'ANNOTATED_AUTH_TOKEN', token, user: profile }, window.location.origin);
          window.opener?.postMessage({ type: 'ANNOTATED_AUTH_TOKEN', token, user: profile }, window.location.origin);
        };
        // Send immediately (content script may already be listening)
        sendAuth();
        // Also respond if content script asks later
        const onReady = (event) => {
          if (event.data?.type === 'ANNOTATED_EXTENSION_READY') sendAuth();
        };
        window.addEventListener('message', onReady);
        removeReadyListener = () => window.removeEventListener('message', onReady);
        setState('sent');
      })
      .catch(() => {
        if (!cancelled) setState('needs-login');
      });

    return () => {
      cancelled = true;
      removeReadyListener?.();
    };
  }, []);

  function login(provider) {
    window.location.href = authUrl(provider);
  }

  return (
    <main className="login-page extension-auth-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        {state === 'needs-login' ? (
          <>
            <div>
              <h1>Connect the extension</h1>
              <p>Sign in once, then the side panel will use your Annotated account.</p>
            </div>
            <button className="oauth-button" onClick={() => login('google')}>Continue with Google</button>
            <button className="oauth-button" onClick={() => login('twitter')}>Continue with X</button>
          </>
        ) : (
          <div>
            <h1>{state === 'sent' ? 'Extension connected' : 'Checking your session'}</h1>
            <p>{user?.username ? `Signed in as @${user.username}.` : 'This window can close once the extension updates.'}</p>
          </div>
        )}
      </section>
    </main>
  );
}
