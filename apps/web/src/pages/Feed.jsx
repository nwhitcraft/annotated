import { useEffect, useMemo, useState } from 'react';
import AnnotationCard from '../components/AnnotationCard.jsx';
import { getFeed } from '../lib/api.js';

const tabs = [
  { key: 'latest', label: 'Latest' },
  { key: 'trending', label: 'Trending' },
  { key: 'article', label: 'Articles' },
  { key: 'youtube', label: 'Videos' },
  { key: 'podcast', label: 'Podcasts' },
  { key: 'following', label: 'Following' },
];

function SkeletonFeed() {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <div className="annotation-card skeleton-card" key={item}>
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-90" />
          <div className="skeleton-block" />
          <div className="skeleton-line w-70" />
        </div>
      ))}
    </>
  );
}

export default function Feed() {
  const [activeTab, setActiveTab] = useState('latest');
  const [items, setItems] = useState([]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setVisibleCount(6);
    getFeed(activeTab)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load feed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  return (
    <div className="feed-page page-wrap">
      <section className="feed-hero">
        <span className="eyebrow">Live commentary layer</span>
        <h1>What the internet is talking about</h1>
        <p>Clip the moment, publish the take, and let the thread form around the source instead of around a lonely link.</p>
      </section>

      <div className="tabbar" role="tablist" aria-label="Feed filters">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="notice notice-danger">{error}</div>}

      <div className="feed-list">
        {loading ? (
          <SkeletonFeed />
        ) : visibleItems.length === 0 ? (
          <div className="empty-state">
            <strong>No annotations here yet</strong>
            <p>Fresh clips will land here as soon as people start arguing with the internet.</p>
          </div>
        ) : (
          visibleItems.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} />)
        )}
      </div>

      {!loading && visibleCount < items.length && (
        <div className="load-more">
          <button className="btn btn-secondary" onClick={() => setVisibleCount((count) => count + 6)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
