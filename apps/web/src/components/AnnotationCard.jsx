import { Link, useNavigate } from 'react-router-dom';
import ActionBar from './ActionBar.jsx';
import SourceBadge from './SourceBadge.jsx';
import UserAvatar from './UserAvatar.jsx';
import { domainFromUrl, formatTime, timeAgo } from '../lib/format.js';

export default function AnnotationCard({ annotation, compact = false, expanded = false }) {
  const navigate = useNavigate();
  const user = {
    username: annotation.username,
    display_name: annotation.display_name,
    avatar_url: annotation.avatar_url,
  };
  const sourceDomain = annotation.source_domain || domainFromUrl(annotation.source_url);
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;

  function openDetail() {
    if (!expanded) navigate(`/a/${annotation.id}`);
  }

  function openComments() {
    navigate(`/a/${annotation.id}#comments`);
  }

  return (
    <article className={`annotation-card ${expanded ? 'annotation-card-expanded' : ''}`} onClick={openDetail}>
      <header className="annotation-author-row">
        <Link to={`/u/${annotation.username}`} className="annotation-author" onClick={(event) => event.stopPropagation()}>
          <UserAvatar user={user} size={expanded ? 'lg' : 'md'} />
          <span>
            <strong>{annotation.display_name || annotation.username || 'Anonymous'}</strong>
            <span>@{annotation.username || 'anon'} · {timeAgo(annotation.created_at)}</span>
          </span>
        </Link>
        <SourceBadge type={annotation.source_type} />
      </header>

      <a
        className="source-preview"
        href={annotation.source_url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {annotation.source_thumbnail && (
          <img src={annotation.source_thumbnail} alt="" className="source-preview-image" />
        )}
        <span className="source-preview-copy">
          <span className="source-domain">{sourceDomain}</span>
          <strong>{annotation.source_title || annotation.source_url}</strong>
        </span>
        <span className="source-preview-arrow" aria-hidden="true">↗</span>
      </a>

      {annotation.clip_text && (
        <blockquote className="clip-quote">
          <span className="clip-quote-mark" aria-hidden="true" />
          <p>{annotation.clip_text}</p>
        </blockquote>
      )}

      {!annotation.clip_text && hasRange && (
        <div className="media-clip">
          {annotation.source_thumbnail && <img src={annotation.source_thumbnail} alt="" />}
          <div className="media-clip-body">
            <span>{annotation.source_type === 'podcast' ? 'Audio excerpt' : 'Video excerpt'}</span>
            <strong>{formatTime(annotation.clip_start_sec)} to {formatTime(annotation.clip_end_sec)}</strong>
            <div className="clip-timeline" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      )}

      {annotation.clip_media_path && annotation.source_type === 'youtube' && (
        <video controls className="embedded-media" preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={annotation.clip_media_path} type="video/mp4" />
        </video>
      )}

      {annotation.clip_media_path && annotation.source_type === 'podcast' && (
        <audio controls className="embedded-audio" preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={annotation.clip_media_path} type="audio/mpeg" />
        </audio>
      )}

      <p className={`annotation-commentary ${compact ? 'annotation-commentary-compact' : ''}`}>
        {annotation.commentary}
      </p>

      <ActionBar annotation={annotation} onOpenComments={openComments} dense={compact} />
    </article>
  );
}
