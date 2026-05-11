import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthButtons from '../components/AuthButtons.jsx';
import { setCurrentUserId, setToken } from '../lib/api.js';

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('jwt');
    const userId = params.get('user_id') || params.get('userId');
    if (token) {
      setToken(token);
      setCurrentUserId(userId);
      navigate('/feed', { replace: true });
    }
  }, [navigate]);

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        <div>
          <h1>Sign in to join the conversation</h1>
          <p>Clip sources, write commentary, and reply with context.</p>
        </div>
        <AuthButtons compact />
        <footer>By continuing, you agree to Terms and Privacy.</footer>
      </section>
    </main>
  );
}
