import { Link, NavLink, Outlet } from 'react-router-dom';
import UserAvatar from './UserAvatar.jsx';
import UserSearch from './UserSearch.jsx';
import { currentUser } from '../lib/mockData.js';

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="wordmark" to="/">annotated</Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/" end>Feed</NavLink>
            <NavLink to="/new">Annotate</NavLink>
            <NavLink to={`/u/${currentUser.username}`}>Profile</NavLink>
          </nav>
          <div className="header-tools">
            <UserSearch />
            <Link to="/login" className="avatar-link" aria-label="Account">
              <UserAvatar user={currentUser} size="sm" />
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
