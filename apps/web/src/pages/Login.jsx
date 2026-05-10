import { Link } from 'react-router-dom';

export default function Login() {
  function go(path) {
    window.location.href = path;
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link to="/" className="wordmark">annotated</Link>
        <div>
          <h1>Sign in to join the conversation</h1>
          <p>Clip sources, write commentary, and reply with context.</p>
        </div>
        <button className="oauth-button" onClick={() => go('/api/auth/google')}>Continue with Google</button>
        <button className="oauth-button" onClick={() => go('/api/auth/twitter')}>Continue with X</button>
        <footer>By continuing, you agree to Terms and Privacy.</footer>
      </section>
    </main>
  );
}
