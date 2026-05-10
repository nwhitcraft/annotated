import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AnnotationItem from '../components/AnnotationItem.jsx';
import { getUser, getUserAnnotations, toggleFollow } from '../lib/api.js';

export default function Profile() {
  const { username } = useParams();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('annotations');
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUser(username)
      .then(async (profile) => {
        const annotations = await getUserAnnotations(profile.id || username, tab);
        if (cancelled) return;
        setUser(profile);
        setFollowing(Boolean(profile.following));
        setItems(annotations);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, tab]);

  async function follow() {
    const next = !following;
    setFollowing(next);
    try {
      const data = await toggleFollow(user.id);
      if (typeof data.following === 'boolean') setFollowing(data.following);
    } catch {
      // Keep optimistic state.
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton-item">
          <div className="skeleton-line short" />
          <div className="skeleton-line headline" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>User not found.</strong>
          <p>This profile does not exist yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="profile-header">
        <div>
          <h1>{user.display_name || user.username}</h1>
          <p>@{user.username}</p>
        </div>
        <button className="button button-outline" onClick={follow}>{following ? 'Following' : 'Follow'}</button>
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        <p className="profile-stats">
          <strong>{Number(user.stats?.annotations || 0).toLocaleString()}</strong> annotations · <strong>{Number(user.stats?.followers || 0).toLocaleString()}</strong> followers · <strong>{Number(user.stats?.following || 0).toLocaleString()}</strong> following
        </p>
      </section>

      <nav className="text-tabs" aria-label="Profile tabs">
        <button className={tab === 'annotations' ? 'active' : ''} onClick={() => setTab('annotations')}>Annotations</button>
        <button className={tab === 'liked' ? 'active' : ''} onClick={() => setTab('liked')}>Liked</button>
      </nav>

      {items.length === 0 ? (
        <div className="empty-state">
          <strong>No {tab} yet.</strong>
          <p>This section is still quiet.</p>
        </div>
      ) : (
        <div className="ruled-list">
          {items.map((annotation) => <AnnotationItem key={annotation.id} annotation={annotation} />)}
        </div>
      )}
    </div>
  );
}
