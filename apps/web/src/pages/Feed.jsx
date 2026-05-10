import { useState, useEffect } from 'react';
import AnnotationCard from '../components/AnnotationCard.jsx';

const TABS = [
  { key: 'latest', label: 'Latest' },
  { key: 'trending', label: 'Trending' },
  { key: 'article', label: '📰 Articles' },
  { key: 'youtube', label: '▶ Videos' },
  { key: 'podcast', label: '🎙 Podcasts' },
];

export default function Feed() {
  const [tab, setTab] = useState('latest');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
  }, [tab]);

  async function loadFeed() {
    setLoading(true);
    try {
      let url = '/api/feed';
      if (tab === 'trending') url = '/api/feed/trending';
      else if (['article', 'youtube', 'podcast'].includes(tab)) url = `/api/feed?type=${tab}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }

  return (
    <div className="feed-page container" style={{ maxWidth: 960 }}>
      {/* Hero */}
      <div className="feed-hero">
        <h1 className="feed-hero-title">
          <span className="feed-hero-mark">✦</span> What the internet is talking about
        </h1>
        <p className="feed-hero-sub text-secondary">
          Clips, commentary, and context from people worth following.
        </p>
      </div>

      {/* Tabs */}
      <div className="feed-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`feed-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="feed-list">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 200 }}>
              <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 48, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, width: '80%' }} />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="feed-empty">
            <div className="feed-empty-icon">✦</div>
            <h3>No annotations yet</h3>
            <p className="text-secondary">Be the first to clip something.</p>
          </div>
        ) : (
          items.map(item => <AnnotationCard key={item.id} annotation={item} />)
        )}
      </div>

      <style>{`
        .feed-hero {
          text-align: center;
          padding: var(--space-3xl) 0 var(--space-2xl);
        }
        
        .feed-hero-title {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.2;
        }
        
        .feed-hero-mark {
          color: var(--accent);
        }
        
        .feed-hero-sub {
          margin-top: var(--space-sm);
          font-size: 16px;
        }
        
        .feed-tabs {
          display: flex;
          gap: var(--space-xs);
          padding-bottom: var(--space-lg);
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: var(--space-xl);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        .feed-tab {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-tertiary);
          border-radius: var(--radius-full);
          white-space: nowrap;
          transition: all var(--transition-normal);
        }
        
        .feed-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        
        .feed-tab.active {
          color: var(--text-primary);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
        }
        
        .feed-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          max-width: var(--content-width);
          margin: 0 auto;
        }
        
        .feed-empty {
          text-align: center;
          padding: var(--space-3xl) 0;
        }
        
        .feed-empty-icon {
          font-size: 48px;
          color: var(--accent);
          margin-bottom: var(--space-md);
        }
        
        .feed-empty h3 {
          font-size: 18px;
          margin-bottom: var(--space-sm);
        }
      `}</style>
    </div>
  );
}
