import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchUsers, toggleFollow } from '../lib/api.js';
import UserAvatar from './UserAvatar.jsx';

export default function UserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState({});
  const wrapperRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      searchUsers(term)
        .then((users) => {
          if (cancelled) return;
          setResults(users);
          setFollowing((current) => {
            const next = { ...current };
            users.forEach((user) => {
              if (next[user.id] == null) next[user.id] = Boolean(user.following);
            });
            return next;
          });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  async function follow(event, user) {
    event.preventDefault();
    event.stopPropagation();
    const next = !following[user.id];
    setFollowing((current) => ({ ...current, [user.id]: next }));
    try {
      const data = await toggleFollow(user.id);
      if (typeof data.following === 'boolean') {
        setFollowing((current) => ({ ...current, [user.id]: data.following }));
      }
    } catch {
      // Keep optimistic state when the demo API is unavailable.
    }
  }

  return (
    <div className="user-search" ref={wrapperRef}>
      <label className="search-label" htmlFor="user-search">Search Annotaters</label>
      <input
        id="user-search"
        type="search"
        value={query}
        placeholder="Search Annotaters"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length >= 2 && (
        <div className="search-results" role="listbox" aria-label="User search results">
          {loading ? (
            <p className="search-note">Searching...</p>
          ) : results.length === 0 ? (
            <p className="search-note">No writers found.</p>
          ) : (
            results.map((user) => (
              <Link className="search-result" to={`/u/${user.username}`} key={user.id} onClick={() => setOpen(false)}>
                <UserAvatar user={user} size="sm" />
                <span className="search-result-copy">
                  <strong>{user.display_name || user.username}</strong>
                  <span>@{user.username}</span>
                </span>
                <button className="follow-mini" onClick={(event) => follow(event, user)}>
                  {following[user.id] ? 'Following' : 'Follow'}
                </button>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
