import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkAuth, setCurrentUserId, setToken, setUsername, setAvatarUrl } from '../lib/api.js';
import AuthButtons from '../components/AuthButtons.jsx';

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
      checkAuth().then((result) => {
        if (result.error) {
          navigate('/login', { replace: true });
          return;
        }
        navigate(result.onboardingCompleted ? '/feed' : '/onboarding', { replace: true });
      });
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
  const error = useMemo(() => new URLSearchParams(window.location.search).get('error'), []);
  const errorMessages = {
    account_banned: 'This account is banned after a claim review.',
    google_not_configured: 'Google sign-in is not configured for this environment yet.',
    twitter_not_configured: 'X sign-in is not configured for this environment yet.',
    google_failed: 'Google sign-in did not complete. Please try again.',
    twitter_failed: 'X sign-in did not complete. Please try again.',
  };
  const errorMessage = errorMessages[error] || '';

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        <div>
          <h1>Sign in to join the conversation</h1>
          <p>Clip sources, write commentary, and reply with context.</p>
        </div>
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <AuthButtons compact />
        <footer>By continuing, you agree to Terms and Privacy.</footer>
      </section>
    </main>
  );
}
