import { useState } from 'react';
import { formatDate } from '../lib/detect.js';
import { mediaSrc } from '../lib/localStore.js';
import SourceType from './SourceType.jsx';
import UserAvatar from './UserAvatar.jsx';

function ActionIcon({ type }) {
  const paths = {
    credible: <path d="M4 12.5l5 5L20 6" />,
    disagree: <path d="M6 6l12 12M18 6L6 18" />,
    comments: <path d="M21 12a8 8 0 0 1-12 6.9L4 20l1.1-5A8 8 0 1 1 21 12Z" />,
    claims: <path d="M12 3v18M5 8l7-5 7 5M5 8v8l7 5 7-5V8" />,
  };

  return (
    <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[type]}
    </svg>
  );
}

export default function PublicAnnotationCard({
  annotation,
  authUser,
  onOpenProfile,
  onToggleLike,
  onToggleNoteworthy,
  onRequireAuth,
}) {
  const [liked, setLiked] = useState(Boolean(annotation.liked));
  const [likes, setLikes] = useState(Number(annotation.like_count || 0));
  const [noteworthy, setNoteworthy] = useState(Boolean(annotation.noteworthy));
  const [noteworthyCount, setNoteworthyCount] = useState(Number(annotation.noteworthy_count || 0));
  const author = {
    username: annotation.username,
    display_name: annotation.display_name,
    avatar_url: annotation.avatar_url,
  };
  const domain = annotation.source_domain || sourceDomain(annotation.source_url);
  const sourceUrl = `${annotation.source_url || ''} ${annotation.source_domain || ''}`;
  const isYouTubeSource = annotation.source_type === 'youtube' || /youtube\.com|youtu\.be/i.test(sourceUrl);
  const hasMediaClip = Boolean(annotation.clip_media_path);
  const isAudioClip = hasMediaClip && (annotation.source_type === 'podcast' || isAudioPath(annotation.clip_media_path));
  const isVideoClip = hasMediaClip && !isAudioClip;
  const sourceType = isYouTubeSource || isVideoClip ? 'video' : annotation.source_type || 'article';
  const sourceTitle = annotation.source_title || annotation.source_url || 'Untitled source';
  const sourceMeta = sourceByline(annotation, domain);
  const kind = annotation.annotation_type || 'Opinion';
  const sourceHref = annotation.source_url || '#';
  const hasRange = annotation.clip_start_sec != null && annotation.clip_end_sec != null;

  async function credible(event) {
    event.stopPropagation();
    if (!authUser) {
      onRequireAuth?.();
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await onToggleLike(annotation.id);
      if (typeof data.liked === 'boolean') setLiked(data.liked);
    } catch {
      // Keep the optimistic tap; the next feed refresh reconciles counts.
    }
  }

  async function disagree(event) {
    event.stopPropagation();
    if (!authUser) {
      onRequireAuth?.();
      return;
    }
    const next = !noteworthy;
    setNoteworthy(next);
    setNoteworthyCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await onToggleNoteworthy(annotation.id);
      if (typeof data.noteworthy === 'boolean') setNoteworthy(data.noteworthy);
    } catch {
      // Keep the optimistic tap; the next feed refresh reconciles counts.
    }
  }

  return (
    <article className="public-card">
      <header className="public-card-author">
        <button
          className="public-card-avatar-button"
          type="button"
          onClick={() => onOpenProfile?.(annotation.username || annotation.user_id)}
          aria-label={`Open ${annotation.display_name || annotation.username || 'this user'}'s profile`}
        >
          <UserAvatar user={author} size="md" className="public-card-avatar" />
        </button>
        <div className="public-card-who">
          <button className="public-card-name" type="button" onClick={() => onOpenProfile?.(annotation.username || annotation.user_id)}>
            {annotation.display_name || annotation.username || 'Annotated user'}
          </button>
          <span className="public-card-handle">
            @{annotation.username || annotation.user_id || 'anon'}
            <span className="annotation-dot">·</span>
            {formatDate(annotation.created_at || annotation.published_at || annotation.updated_at)}
          </span>
        </div>
        <div className="public-card-tags">
          <span className="annotation-kind">{kind}</span>
          <SourceType type={annotation.source_type} />
        </div>
      </header>

      <h2 className="public-card-headline">{annotation.commentary}</h2>

      {annotation.clip_text && (
        <blockquote className="clip-blockquote">
          {annotation.clip_text}
        </blockquote>
      )}

      {!annotation.clip_text && hasRange && (
        <p className="media-range">
          {isAudioClip ? 'Audio excerpt' : 'Video excerpt'} · {formatTime(annotation.clip_start_sec)}-{formatTime(annotation.clip_end_sec)}
        </p>
      )}

      <div className={`source-card source-card-${sourceType}`} onClick={(event) => event.stopPropagation()}>
        {isVideoClip ? (
          <div className="source-card-media" aria-label="Video clip">
            <video className="source-card-player" controls preload="metadata">
              <source src={mediaSrc(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'video')} />
            </video>
          </div>
        ) : isAudioClip ? (
          <div className="source-card-media source-card-audio" aria-label="Audio clip">
            <span>Audio clip attached</span>
            <audio className="source-card-audio-player" controls preload="metadata">
              <source src={mediaSrc(annotation.clip_media_path)} type={clipMimeType(annotation.clip_media_path, 'audio')} />
            </audio>
          </div>
        ) : annotation.source_thumbnail ? (
          <a className="source-card-media source-card-image" href={sourceHref} target="_blank" rel="noreferrer" aria-label={`Open source: ${sourceTitle}`}>
            <img src={annotation.source_thumbnail} alt="" />
          </a>
        ) : (
          <a className="source-card-media source-card-placeholder" href={sourceHref} target="_blank" rel="noreferrer" aria-label={`Open source: ${sourceTitle}`}>
            <span>{displayDomain(domain).charAt(0) || 'A'}</span>
          </a>
        )}
        <a className="source-card-body" href={sourceHref} target="_blank" rel="noreferrer" aria-label={`Open source: ${sourceTitle}`}>
          <span className="source-card-meta">
            <span>{displayDomain(domain) || 'SOURCE'}</span>
            <span className="source-card-external" aria-hidden="true">↗</span>
          </span>
          <strong className="source-card-title">{sourceTitle}</strong>
          {sourceMeta && <span className="source-card-deck">{sourceMeta}</span>}
        </a>
      </div>

      <footer className="action-row public-actions" aria-label="Annotation actions">
        <button className={liked ? 'active' : ''} type="button" onClick={credible}>
          <ActionIcon type="credible" />
          <span>Credible</span>
          <span className="count">{likes}</span>
        </button>
        <button className={noteworthy ? 'active' : ''} type="button" onClick={disagree}>
          <ActionIcon type="disagree" />
          <span>Disagree</span>
          <span className="count">{noteworthyCount}</span>
        </button>
        <span>
          <ActionIcon type="comments" />
          <span>Comments</span>
          <span className="count">{annotation.comment_count || 0}</span>
        </span>
        <span>
          <ActionIcon type="claims" />
          <span>Claims</span>
          <span className="count">{annotation.claim_count || 0}</span>
        </span>
      </footer>
    </article>
  );
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
  return [sourceName, sourceDate ? formatDate(sourceDate) : ''].filter(Boolean).join(' · ');
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function sourceDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
