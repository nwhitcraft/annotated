import { Link, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import UserAvatar from './UserAvatar.jsx';
import UserSearch from './UserSearch.jsx';
import { checkAuth, getAvatarUrl, getCurrentUserId, getDisplayName, getToken, getUsername } from '../lib/api.js';

function viewerFromStorage() {
  if (!getToken()) return null;
  const username = getUsername();
  const userId = getCurrentUserId();
  return {
    id: userId,
    username: username || userId,
    display_name: getDisplayName() || username || 'User',
    avatar_url: getAvatarUrl() || '',
  };
}

export default function Layout() {
  const [viewer, setViewer] = useState(viewerFromStorage);

  useEffect(() => {
    let cancelled = false;
    const applyCachedViewer = (event) => {
      const cached = viewerFromStorage();
      setViewer(cached ? { ...cached, ...(event?.detail || {}) } : null);
    };

    applyCachedViewer();
    window.addEventListener('annotated:user-updated', applyCachedViewer);

    if (!getToken()) return () => {
      cancelled = true;
      window.removeEventListener('annotated:user-updated', applyCachedViewer);
    };

    checkAuth().then((result) => {
      if (cancelled || result.error) return;
      setViewer({ ...result.user, avatar_url: result.user.avatar_url || '' });
    });
    return () => {
      cancelled = true;
      window.removeEventListener('annotated:user-updated', applyCachedViewer);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="wordmark" to="/">annotated</Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/feed">Feed</NavLink>
            <NavLink to="/new">Annotate</NavLink>
            <NavLink to="/download">Desktop</NavLink>
            {viewer && <NavLink to={`/u/${viewer.username}`}>Profile</NavLink>}
            {viewer?.is_admin && <NavLink to="/admin/claims">Reports</NavLink>}
          </nav>
          <div className="header-tools">
            <UserSearch />
            {viewer ? (
              <Link to={`/u/${viewer.username}`} className="avatar-link" aria-label="Account">
                <UserAvatar user={viewer} size="sm" />
              </Link>
            ) : (
              <Link to="/login" className="avatar-link" aria-label="Sign in">
                <span className="avatar avatar-sm">?</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  );
}
