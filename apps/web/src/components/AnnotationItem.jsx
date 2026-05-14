import { Link, useNavigate } from 'react-router-dom';
import ActionRow from './ActionRow.jsx';
import UserAvatar from './UserAvatar.jsx';
import { API_ORIGIN } from '../lib/api.js';
import { domainFromUrl, formatTime, timeAgo } from '../lib/format.js';

function mediaUrl(path) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  if (path.startsWith('/media')) return `${API_ORIGIN}${path}`;
  return path;
}

function clipMimeType(path, kind) {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.webm') || lower.endsWith('.weba')) return `${kind}/webm`;
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return `${kind}/ogg`;
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return kind === 'audio' ? 'audio/mpeg' : 'video/webm';
}

function isAudioPath(path) {
  return /\.(mp3|m4a|aac|wav|ogg|opus|weba)$/i.test(String(path || ''));
}

function displayDomain(value) {
  return String(value || '')
    .replace(/^www\./i, '')
    .toUpperCase();
}

function sourceByline(annotation, domain) {
  const sourceName = annotation.source_author || annotation.source_site_name || domain;
  const sourceDate = annotation.source_published_at || annotation.published_at || annotation.created_at;
  return [sourceName, sourceDate ? timeAgo(sourceDate) : ''].filter(Boolean).join(' · ');
}

export default function AnnotationItem({ annotation, expanded = false, canDelete = false, onDelete }) {
  const navigate = useNavigate();
  const domain = annotation.source_domain || domainFromUrl(annotation.source_url);
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;
  const sourceUrl = `${annotation.source_url || ''} ${annotation.source_domain || ''}`;
  const isYouTubeSource = annotation.source_type === 'youtube' || /youtube\.com|youtu\.be/i.test(sourceUrl);
  const hasMediaClip = Boolean(annotation.clip_media_path);
  const isAudioClip = hasMediaClip && (annotation.source_type === 'podcast' || isAudioPath(annotation.clip_media_path));
  const isVideoClip = hasMediaClip && !isAudioClip;
  const kind = annotation.annotation_type || 'Opinion';
  const sourceType = isYouTubeSource || isVideoClip ? 'video' : annotation.source_type || 'article';
  const sourceTitle = annotation.source_title || annotation.source_url || 'Untitled source';
  const sourceMeta = sourceByline(annotation, domain);
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
      <header className="annotation-card-author">
        <Link className="author-avatar-link" to={`/u/${annotation.username}`} onClick={(event) => event.stopPropagation()} aria-label={`Open ${annotation.display_name || annotation.username}'s profile`}>
          <UserAvatar user={author} size="md" className="annotation-card-avatar" />
        </Link>
        <div className="annotation-card-who">
          <Link className="annotation-card-name" to={`/u/${annotation.username}`} onClick={(event) => event.stopPropagation()}>
            {annotation.display_name || annotation.username || 'Anonymous'}
          </Link>
          <span className="annotation-card-handle">
            @{annotation.username || 'anon'}
            <span className="annotation-dot">·</span>
            {timeAgo(annotation.created_at)}
          </span>
        </div>
        <div className="annotation-card-tags">
          <span className="annotation-kind">{kind}</span>
          {annotation.status && annotation.status !== 'published' && (
            <span className={`annotation-status-tag ${annotation.status}`}>{annotation.status}</span>
          )}
        </div>
      </header>

      <h2 className="annotation-headline">{annotation.commentary}</h2>

      {annotation.clip_text && (
        <blockquote className="clip-blockquote">
          {annotation.clip_text}
        </blockquote>
      )}

      {!annotation.clip_text && hasRange && (
        <p className="media-range">
          {isAudioClip ? 'Audio excerpt' : 'Video excerpt'} · {formatTime(annotation.clip_start_sec)}–{formatTime(annotation.clip_end_sec)}
        </p>
      )}

      <div className={`source-card source-card-${sourceType}`} onClick={(event) => event.stopPropagation()}>
        {isVideoClip ? (
          <div className="source-card-media" aria-label="Video clip">
            <video controls className="source-card-player" preload="metadata">
              <source src={mediaUrl(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'video')} />
            </video>
          </div>
        ) : isAudioClip ? (
          <div className="source-card-media source-card-audio" aria-label="Audio clip">
            <span>Audio clip attached</span>
            <audio controls className="source-card-audio-player" preload="metadata">
              <source src={mediaUrl(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'audio')} />
            </audio>
          </div>
        ) : annotation.source_thumbnail ? (
          <a
            className="source-card-media source-card-image"
            href={annotation.source_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source: ${sourceTitle}`}
          >
            <img src={annotation.source_thumbnail} alt="" />
          </a>
        ) : (
          <a
            className="source-card-media source-card-placeholder"
            href={annotation.source_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source: ${sourceTitle}`}
          >
            <span>{displayDomain(domain).charAt(0) || 'A'}</span>
          </a>
        )}
        <a
          className="source-card-body"
          href={annotation.source_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source: ${sourceTitle}`}
        >
          <span className="source-card-meta">
            <span>{displayDomain(domain) || 'SOURCE'}</span>
            <span className="source-card-external" aria-hidden="true">↗</span>
          </span>
          <strong className="source-card-title">{sourceTitle}</strong>
          {sourceMeta && <span className="source-card-deck">{sourceMeta}</span>}
        </a>
      </div>

      <ActionRow annotation={annotation} onOpenComments={openComments} />
      {canDelete && (
        <button className="annotation-delete" type="button" onClick={(event) => {
          event.stopPropagation();
          onDelete?.(annotation);
        }}>
          Remove annotation
        </button>
      )}
    </article>
  );
}
