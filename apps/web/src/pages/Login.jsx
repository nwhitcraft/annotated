import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authUrl, hydrateCurrentUser, setCurrentUserId, setToken, setUsername, setAvatarUrl } from '../lib/api.js';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('jwt');
    const userId = params.get('user_id') || params.get('userId');
    const username = params.get('username');
    const avatarUrl = params.get('avatar_url');
    if (token) {
      setToken(token);
      setCurrentUserId(userId);
      if (username) setUsername(username);
      if (avatarUrl) setAvatarUrl(avatarUrl);
      hydrateCurrentUser().finally(() => navigate('/', { replace: true }));
    }
  }, [navigate]);

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        <p>Signing you in...</p>
      </section>
    </main>
  );
}

export default function Login() {

  function go(provider) {
    window.location.href = authUrl(provider);
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        <div>
          <h1>Sign in to join the conversation</h1>
          <p>Clip sources, write commentary, and reply with context.</p>
        </div>
        <button className="oauth-button" onClick={() => go('google')}>Continue with Google</button>
        <button className="oauth-button" onClick={() => go('twitter')}>Continue with X</button>
        <footer>By continuing, you agree to Terms and Privacy.</footer>
      </section>
    </main>
  );
}
