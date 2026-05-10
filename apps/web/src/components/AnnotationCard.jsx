import { Link } from 'react-router-dom';

const typeConfig = {
  article: { icon: '📰', label: 'Article', badgeClass: 'badge-article' },
  youtube: { icon: '▶', label: 'YouTube', badgeClass: 'badge-youtube' },
  podcast: { icon: '🎙', label: 'Podcast', badgeClass: 'badge-podcast' },
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export default function AnnotationCard({ annotation }) {
  const {
    id, source_url, source_title, source_type, source_domain, source_thumbnail,
    clip_text, clip_start_sec, clip_end_sec, clip_media_path,
    commentary, pin_count, comment_count, created_at,
    username, display_name, avatar_url
  } = annotation;

  const type = typeConfig[source_type] || typeConfig.article;

  return (
    <article className="annotation-card card">
      {/* Author row */}
      <div className="ann-author">
        <div className="avatar avatar-sm avatar-placeholder">
          {avatar_url 
            ? <img src={avatar_url} alt="" className="avatar avatar-sm" />
            : (display_name || username || '?')[0].toUpperCase()
          }
        </div>
        <div className="ann-author-info">
          <Link to={`/u/${username}`} className="ann-author-name">{display_name || username}</Link>
          <span className="ann-author-time text-muted">{timeAgo(created_at)}</span>
        </div>
        <span className={`badge ${type.badgeClass}`}>{type.icon} {type.label}</span>
      </div>

      {/* Source reference */}
      <a href={source_url} target="_blank" rel="noopener" className="ann-source">
        {source_thumbnail && (
          <img src={source_thumbnail} alt="" className="ann-source-thumb" />
        )}
        <div className="ann-source-meta">
          <div className="ann-source-title truncate">{source_title || source_url}</div>
          <div className="ann-source-domain text-muted">{source_domain}</div>
        </div>
      </a>

      {/* Clip content */}
      <div className="ann-clip">
        {clip_text && (
          <blockquote className="ann-clip-text">
            <span className="ann-clip-mark">❝</span>
            {clip_text}
          </blockquote>
        )}
        {clip_media_path && source_type === 'youtube' && (
          <video controls className="ann-clip-video" preload="metadata">
            <source src={clip_media_path} type="video/mp4" />
          </video>
        )}
        {clip_media_path && source_type === 'podcast' && (
          <audio controls className="ann-clip-audio" preload="metadata">
            <source src={clip_media_path} type="audio/mpeg" />
          </audio>
        )}
        {(clip_start_sec != null && clip_end_sec != null) && (
          <div className="ann-clip-range text-muted">
            {formatTime(clip_start_sec)} – {formatTime(clip_end_sec)}
          </div>
        )}
      </div>

      {/* Commentary */}
      <div className="ann-commentary font-serif">
        {commentary}
      </div>

      {/* Actions */}
      <div className="ann-actions">
        <Link to={`/a/${id}`} className="btn-ghost ann-action">
          💬 {comment_count || ''}
        </Link>
        <button className="btn-ghost ann-action">
          📌 {pin_count || ''}
        </button>
        <a href={source_url} target="_blank" rel="noopener" className="btn-ghost ann-action">
          🔗 Source
        </a>
      </div>

      <style>{`
        .annotation-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
        
        .ann-author {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        
        .ann-author-info {
          flex: 1;
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
        }
        
        .ann-author-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .ann-author-name:hover { color: var(--accent); }
        
        .ann-author-time {
          font-size: 12px;
        }
        
        .ann-source {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          transition: border-color var(--transition-normal);
        }
        
        .ann-source:hover {
          border-color: var(--border);
        }
        
        .ann-source-thumb {
          width: 64px;
          height: 48px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        
        .ann-source-title {
          font-size: 13px;
          font-weight: 500;
        }
        
        .ann-source-domain {
          font-size: 12px;
          margin-top: 2px;
        }
        
        .ann-clip-text {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 15px;
          line-height: 1.7;
          color: var(--text-secondary);
          padding: var(--space-md) var(--space-lg);
          border-left: 3px solid var(--accent);
          background: var(--accent-subtle);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          position: relative;
        }
        
        .ann-clip-mark {
          color: var(--accent);
          font-style: normal;
          margin-right: 4px;
          font-size: 18px;
          line-height: 1;
          vertical-align: -2px;
        }
        
        .ann-clip-video {
          width: 100%;
          border-radius: var(--radius-md);
          background: #000;
          max-height: 300px;
        }
        
        .ann-clip-audio {
          width: 100%;
          border-radius: var(--radius-md);
          height: 48px;
        }
        
        .ann-clip-range {
          font-size: 12px;
          margin-top: var(--space-xs);
        }
        
        .ann-commentary {
          font-size: 16px;
          line-height: 1.7;
          color: var(--text-primary);
        }
        
        .ann-actions {
          display: flex;
          gap: var(--space-sm);
          padding-top: var(--space-sm);
          border-top: 1px solid var(--border-subtle);
        }
        
        .ann-action {
          font-size: 13px;
          color: var(--text-tertiary);
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .ann-action:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
      `}</style>
    </article>
  );
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
