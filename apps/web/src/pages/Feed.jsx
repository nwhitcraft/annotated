import { useEffect, useMemo, useState } from 'react';
import AnnotationItem from '../components/AnnotationItem.jsx';
import { getFeed } from '../lib/api.js';

const tabs = [
  { key: 'latest', label: 'Latest' },
  { key: 'trending', label: 'Trending' },
  { key: 'article', label: 'Articles' },
  { key: 'youtube', label: 'Videos' },
  { key: 'podcast', label: 'Podcasts' },
  { key: 'following', label: 'Following' },
];

function LoadingFeed() {
  return (
    <div className="ruled-list">
      {[0, 1, 2].map((item) => (
        <div className="skeleton-item" key={item}>
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
          <div className="skeleton-block" />
          <div className="skeleton-line headline" />
        </div>
      ))}
    </div>
  );
}

export default function Feed() {
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
    getFeed(tab)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load feed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const visibleItems = useMemo(() => items.slice(0, visible), [items, visible]);

  return (
    <div className="page page-feed">
      <header className="feed-heading">
        <p>Latest commentary</p>
      </header>

      <nav className="text-tabs" aria-label="Feed filters">
        {tabs.map((item) => (
          <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {error && <p className="notice error">{error}</p>}

      {loading ? (
        <LoadingFeed />
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <strong>No annotations yet.</strong>
          <p>The first clipped argument will appear here.</p>
        </div>
      ) : (
        <div className="ruled-list">
          {visibleItems.map((annotation) => (
            <AnnotationItem key={annotation.id} annotation={annotation} />
          ))}
        </div>
      )}

      {!loading && visible < items.length && (
        <div className="load-more">
          <button className="button button-outline" onClick={() => setVisible((count) => count + 8)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
