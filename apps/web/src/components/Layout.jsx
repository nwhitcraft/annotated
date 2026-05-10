import { Link, NavLink, Outlet } from 'react-router-dom';
import UserAvatar from './UserAvatar.jsx';
import { currentUser } from '../lib/mockData.js';

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="Annotated home">
            <span className="brand-mark">A</span>
            <span>annotated</span>
          </Link>

          <nav className="topnav" aria-label="Primary navigation">
            <NavLink to="/" end>Feed</NavLink>
            <NavLink to="/new">Annotate</NavLink>
            <NavLink to="/u/jason">Profile</NavLink>
          </nav>

          <div className="topbar-actions">
            <Link to="/new" className="btn btn-primary btn-sm">New</Link>
            <Link to="/login" className="avatar-link" aria-label="Open account">
              <UserAvatar user={currentUser} size="sm" />
            </Link>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
