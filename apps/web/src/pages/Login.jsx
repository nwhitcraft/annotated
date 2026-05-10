import { Link } from 'react-router-dom';

export default function Login() {
  function go(path) {
    window.location.href = path;
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link to="/" className="brand auth-brand">
          <span className="brand-mark">A</span>
          <span>annotated</span>
        </Link>
        <div className="auth-copy">
          <h1>Join the conversation</h1>
          <p>Sign in to clip sources, publish commentary, and reply inside the thread.</p>
        </div>
        <div className="auth-actions">
          <button className="oauth-button google" onClick={() => go('/api/auth/google')}>
            <span>G</span>
            Sign in with Google
          </button>
          <button className="oauth-button x" onClick={() => go('/api/auth/twitter')}>
            <span>X</span>
            Sign in with X
          </button>
        </div>
        <p className="auth-footer">By signing in you agree to Terms & Privacy.</p>
      </section>
    </main>
  );
}
