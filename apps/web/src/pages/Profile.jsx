import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AnnotationCard from '../components/AnnotationCard.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { getUser, getUserAnnotations, toggleFollow } from '../lib/api.js';
import { plural } from '../lib/format.js';

export default function Profile() {
  const { username } = useParams();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('annotations');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUser(username), getUserAnnotations(username, tab)])
      .then(([profile, annotations]) => {
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
      <div className="profile-page page-wrap narrow-wrap">
        <div className="profile-header skeleton-card">
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-70" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-wrap narrow-wrap">
        <div className="empty-state">
          <strong>User not found</strong>
          <p>This profile may not exist yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page page-wrap narrow-wrap">
      <section className="profile-header">
        <UserAvatar user={user} size="xl" />
        <div className="profile-copy">
          <div>
            <h1>{user.display_name || user.username}</h1>
            <p>@{user.username}</p>
          </div>
          <button className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`} onClick={follow}>
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        <div className="profile-stats">
          <span><strong>{Number(user.stats?.annotations || 0).toLocaleString()}</strong> annotations</span>
          <span><strong>{Number(user.stats?.followers || 0).toLocaleString()}</strong> followers</span>
          <span><strong>{Number(user.stats?.following || 0).toLocaleString()}</strong> following</span>
        </div>
      </section>

      <div className="tabbar compact" role="tablist" aria-label="Profile feed">
        <button className={tab === 'annotations' ? 'active' : ''} onClick={() => setTab('annotations')}>Annotations</button>
        <button className={tab === 'liked' ? 'active' : ''} onClick={() => setTab('liked')}>Liked</button>
      </div>

      <div className="feed-list">
        {items.length === 0 ? (
          <div className="empty-state">
            <strong>No {tab} yet</strong>
            <p>{user.display_name || user.username} has not added anything to this tab.</p>
          </div>
        ) : (
          items.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} compact />)
        )}
      </div>

      <p className="profile-footnote">{plural(items.length, tab === 'liked' ? 'liked annotation' : 'public annotation')}</p>
    </div>
  );
}
