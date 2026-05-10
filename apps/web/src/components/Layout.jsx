import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner container">
          <Link to="/" className="logo">
            <span className="logo-mark">✦</span>
            <span className="logo-text">annotated</span>
          </Link>

          <nav className="header-nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              Feed
            </Link>
            <Link
              to="/new"
              className="btn btn-primary btn-sm"
            >
              + Annotate
            </Link>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <style>{`
        .app-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        
        .app-header {
          position: sticky;
          top: 0;
          z-index: 100;
          height: var(--header-height);
          background: rgba(10, 10, 11, 0.85);
          backdrop-filter: blur(12px) saturate(180%);
          -webkit-backdrop-filter: blur(12px) saturate(180%);
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 100%;
          max-width: 960px;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.02em;
          text-decoration: none;
        }
        
        .logo-mark {
          color: var(--accent);
          font-size: 20px;
        }
        
        .logo-text {
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .header-nav {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        
        .nav-link {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-tertiary);
          transition: color var(--transition-normal);
          padding: 6px 0;
          position: relative;
        }
        
        .nav-link:hover { color: var(--text-primary); }
        
        .nav-link.active { 
          color: var(--text-primary);
        }
        
        .nav-link.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--accent);
          border-radius: 1px;
        }
        
        .app-main {
          flex: 1;
          padding: var(--space-xl) 0;
        }
      `}</style>
    </div>
  );
}
