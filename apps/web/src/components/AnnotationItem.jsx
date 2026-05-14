import { Link, useNavigate } from 'react-router-dom';
import ActionRow from './ActionRow.jsx';
import SourceType from './SourceType.jsx';
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

export default function AnnotationItem({ annotation, expanded = false, canDelete = false, onDelete }) {
  const navigate = useNavigate();
  const domain = annotation.source_domain || domainFromUrl(annotation.source_url);
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;
  const sourceUrl = `${annotation.source_url || ''} ${annotation.source_domain || ''}`;
  const isYouTubeSource = annotation.source_type === 'youtube' || /youtube\.com|youtu\.be/i.test(sourceUrl);
  const hasMediaClip = Boolean(annotation.clip_media_path);
  const isAudioClip = hasMediaClip && (annotation.source_type === 'podcast' || isAudioPath(annotation.clip_media_path));
  const isVideoClip = hasMediaClip && !isAudioClip;
  const isYouTubeClip = isYouTubeSource && hasMediaClip;
  const displaySourceType = isYouTubeSource || isVideoClip ? 'video' : annotation.source_type;
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
          <SourceType type={displaySourceType} />
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
        {isVideoClip && (
          <div className="source-media">
            <video controls className="media-player" preload="metadata" onClick={(event) => event.stopPropagation()}>
              <source src={mediaUrl(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'video')} />
            </video>
            {isYouTubeClip && (
              <a
                className="source-platform-link youtube-platform-link"
                href={annotation.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <span aria-hidden="true">▶</span>
                Open on YouTube
              </a>
            )}
          </div>
        )}
        {annotation.source_thumbnail && !isVideoClip && (
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
          {isAudioClip ? 'Audio excerpt' : 'Video excerpt'} · {formatTime(annotation.clip_start_sec)}–{formatTime(annotation.clip_end_sec)}
        </p>
      )}

      {isAudioClip && (
        <audio controls className="audio-player" preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={mediaUrl(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'audio')} />
        </audio>
      )}

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
