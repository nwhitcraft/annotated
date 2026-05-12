import { Link, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import UserAvatar from './UserAvatar.jsx';
import UserSearch from './UserSearch.jsx';
import { currentUser } from '../lib/mockData.js';
import { getAvatarUrl, getToken, getUsername } from '../lib/api.js';

export default function Layout() {
  const [viewer, setViewer] = useState(currentUser);

  useEffect(() => {
    if (!getToken()) return;
    const username = getUsername() || currentUser.username;
    setViewer({
      ...currentUser,
      username,
      display_name: username,
      avatar_url: getAvatarUrl() || currentUser.avatar_url,
    });
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="wordmark" to="/">annotated</Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/feed">Feed</NavLink>
            <NavLink to="/new">Annotate</NavLink>
            <NavLink to={`/u/${viewer.username}`}>Profile</NavLink>
          </nav>
          <div className="header-tools">
            <UserSearch />
            <Link to={`/u/${viewer.username}`} className="avatar-link" aria-label="Account">
              <UserAvatar user={viewer} size="sm" />
            </Link>
          </div>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  );
}
