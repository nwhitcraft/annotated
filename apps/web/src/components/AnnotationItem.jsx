import { Link, useNavigate } from 'react-router-dom';
import ActionRow from './ActionRow.jsx';
import SourceType from './SourceType.jsx';
import UserAvatar from './UserAvatar.jsx';
import { domainFromUrl, formatTime, timeAgo } from '../lib/format.js';

export default function AnnotationItem({ annotation, expanded = false }) {
  const navigate = useNavigate();
  const domain = annotation.source_domain || domainFromUrl(annotation.source_url);
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;
  const author = {
    username: annotation.username,
    display_name: annotation.display_name,
    avatar_url: annotation.avatar_url,
  };

  function openDetail() {
    if (!expanded) navigate(`/a/${annotation.id}`);
  }

  function openComments() {
    navigate(`/a/${annotation.id}#comments`);
  }

  return (
    <article className={`annotation-item ${expanded ? 'annotation-item-expanded' : ''}`} onClick={openDetail}>
      <div className="annotation-byline">
        <Link className="author-avatar-link" to={`/u/${annotation.username}`} onClick={(event) => event.stopPropagation()} aria-label={`Open ${annotation.display_name || annotation.username}'s profile`}>
          <UserAvatar user={author} size="sm" />
        </Link>
        <div className="annotation-meta">
          <Link to={`/u/${annotation.username}`} onClick={(event) => event.stopPropagation()}>
            {annotation.display_name || annotation.username || 'Anonymous'}
          </Link>
          <span>@{annotation.username || 'anon'}</span>
          <span>{domain}</span>
          <span>{timeAgo(annotation.created_at)}</span>
          <span className="annotation-type-tag">{annotation.annotation_type || 'Opinion'}</span>
          {annotation.status && annotation.status !== 'published' && (
            <span className={`annotation-status-tag ${annotation.status}`}>{annotation.status}</span>
          )}
          <SourceType type={annotation.source_type} />
        </div>
      </div>

      <div className="source-row">
        <a
          className="source-title"
          href={annotation.source_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {annotation.source_title || annotation.source_url}
        </a>
        {annotation.source_thumbnail && (
          <a
            className="source-thumbnail"
            href={annotation.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Open source: ${annotation.source_title || domain}`}
          >
            <img src={annotation.source_thumbnail} alt="" />
            <span>Open source</span>
          </a>
        )}
      </div>

      <h2 className="annotation-headline">{annotation.commentary}</h2>

      {annotation.clip_text && (
        <blockquote className="clip-blockquote">
          {annotation.clip_text}
        </blockquote>
      )}

      {!annotation.clip_text && hasRange && (
        <p className="media-range">
          {annotation.source_type === 'podcast' ? 'Audio excerpt' : 'Video excerpt'} · {formatTime(annotation.clip_start_sec)}–{formatTime(annotation.clip_end_sec)}
        </p>
      )}

      {annotation.clip_media_path && annotation.source_type === 'youtube' && (
        <video controls className="media-player" preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={annotation.clip_media_path} type="video/mp4" />
        </video>
      )}

      {annotation.clip_media_path && annotation.source_type === 'podcast' && (
        <audio controls className="audio-player" preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={annotation.clip_media_path} type="audio/mpeg" />
        </audio>
      )}

      <ActionRow annotation={annotation} onOpenComments={openComments} />
    </article>
  );
}
