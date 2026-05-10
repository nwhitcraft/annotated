import { Link, useNavigate } from 'react-router-dom';
import ActionRow from './ActionRow.jsx';
import SourceType from './SourceType.jsx';
import { domainFromUrl, formatTime, timeAgo } from '../lib/format.js';

export default function AnnotationItem({ annotation, expanded = false }) {
  const navigate = useNavigate();
  const domain = annotation.source_domain || domainFromUrl(annotation.source_url);
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;

  function openDetail() {
    if (!expanded) navigate(`/a/${annotation.id}`);
  }

  function openComments() {
    navigate(`/a/${annotation.id}#comments`);
  }

  return (
    <article className={`annotation-item ${expanded ? 'annotation-item-expanded' : ''}`} onClick={openDetail}>
      <div className="annotation-meta">
        <Link to={`/u/${annotation.username}`} onClick={(event) => event.stopPropagation()}>
          {annotation.display_name || annotation.username || 'Anonymous'}
        </Link>
        <span>@{annotation.username || 'anon'}</span>
        <span>{domain}</span>
        <span>{timeAgo(annotation.created_at)}</span>
        <SourceType type={annotation.source_type} />
      </div>

      <a
        className="source-title"
        href={annotation.source_url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {annotation.source_title || annotation.source_url}
      </a>

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

      <h2 className="annotation-headline">{annotation.commentary}</h2>
      <ActionRow annotation={annotation} onOpenComments={openComments} />
    </article>
  );
}
