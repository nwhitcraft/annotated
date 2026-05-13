import { useEffect, useMemo, useState } from 'react';
import PublicAnnotationCard from './PublicAnnotationCard.jsx';
import { getFeed, toggleLike, toggleNoteworthy } from '../lib/localStore.js';

const tabs = [
  { key: 'latest', label: 'Latest' },
  { key: 'trending', label: 'Trending' },
  { key: 'article', label: 'Articles' },
  { key: 'youtube', label: 'Videos' },
  { key: 'podcast', label: 'Podcasts' },
  { key: 'twitter', label: 'X' },
  { key: 'tag:Fact Check', label: 'Fact checks' },
  { key: 'following', label: 'Following' },
];

export default function FeedView({ settings, authUser, onOpenProfile, onSignIn, onStatus }) {
  const [tab, setTab] = useState('latest');
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setVisible(8);
    getFeed(tab, settings)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(err.message || 'Unable to load feed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, settings?.apiEndpoint, authUser?.id]);

  const visibleItems = useMemo(() => items.slice(0, visible), [items, visible]);

  function requireAuth() {
    onStatus?.('Sign in to interact with the public feed');
    onSignIn?.('google');
  }

  return (
    <section className="feed-view">
      <header className="section-heading">
        <div>
          <p>Public Feed</p>
          <h2>Annotations from Annotated</h2>
        </div>
        <span>{items.length} loaded</span>
      </header>

      <nav className="visibility-tabs feed-tabs" aria-label="Feed filters">
        {tabs.map((item) => (
          <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="empty-state compact">
          <strong>{error}</strong>
          {!authUser && <button className="button button-outline" type="button" onClick={() => onSignIn?.('google')}>Sign in</button>}
        </div>
      )}

      {loading ? (
        <div className="ruled-list">
          {[0, 1, 2].map((item) => (
            <div className="skeleton-item" key={item}>
              <div className="skeleton-line short" />
              <div className="skeleton-line headline" />
              <div className="skeleton-block" />
            </div>
          ))}
        </div>
      ) : !error && visibleItems.length === 0 ? (
        <div className="empty-state">
          <strong>No annotations yet.</strong>
          <p>The first clipped argument will appear here.</p>
        </div>
      ) : (
        <div className="ruled-list">
          {visibleItems.map((annotation) => (
            <PublicAnnotationCard
              key={annotation.id}
              annotation={annotation}
              authUser={authUser}
              onOpenProfile={onOpenProfile}
              onRequireAuth={requireAuth}
              onToggleLike={(id) => toggleLike(id, settings)}
              onToggleNoteworthy={(id) => toggleNoteworthy(id, settings)}
            />
          ))}
        </div>
      )}

      {!loading && !error && visible < items.length && (
        <div className="load-more">
          <button className="button button-outline" onClick={() => setVisible((count) => count + 8)}>
            Load more
          </button>
        </div>
      )}
    </section>
  );
}
