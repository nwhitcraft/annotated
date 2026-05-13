import { useState } from 'react';
import { formatDate } from '../lib/detect.js';
import { mediaSrc } from '../lib/localStore.js';
import SourceType from './SourceType.jsx';
import UserAvatar from './UserAvatar.jsx';

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
        <button type="button" onClick={() => onOpenProfile?.(annotation.username || annotation.user_id)}>
          <UserAvatar user={author} size="sm" />
          <span>
            <strong>{annotation.display_name || annotation.username || 'Annotated user'}</strong>
            <small>@{annotation.username || annotation.user_id}</small>
          </span>
        </button>
        <span>{formatDate(annotation.created_at || annotation.published_at || annotation.updated_at)}</span>
      </header>

      <div className="annotation-meta">
        <strong>{annotation.source_domain || sourceDomain(annotation.source_url)}</strong>
        <SourceType type={annotation.source_type} />
        {annotation.annotation_type && <span className="visibility-state public">{annotation.annotation_type}</span>}
      </div>

      <a className="source-title" href={annotation.source_url} target="_blank" rel="noreferrer">
        {annotation.source_title || annotation.source_url}
      </a>

      {annotation.clip_text && <blockquote>{annotation.clip_text}</blockquote>}
      {annotation.clip_media_path && ['screen', 'youtube'].includes(annotation.source_type) && (
        <video className="media-player" controls preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={mediaSrc(annotation.clip_media_path)} type={annotation.clip_media_path.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
        </video>
      )}
      {annotation.clip_media_path && annotation.source_type === 'podcast' && (
        <audio className="audio-player" controls preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={mediaSrc(annotation.clip_media_path)} type="audio/mpeg" />
        </audio>
      )}

      <h2>{annotation.commentary}</h2>

      <footer className="public-actions" aria-label="Annotation actions">
        <button className={liked ? 'active' : ''} type="button" onClick={credible}>
          <span>Credible</span>
          {likes}
        </button>
        <button className={noteworthy ? 'active' : ''} type="button" onClick={disagree}>
          <span>Disagree</span>
          {noteworthyCount}
        </button>
        <span>Comments {annotation.comment_count || 0}</span>
        <span>Claims {annotation.claim_count || 0}</span>
      </footer>
    </article>
  );
}

function sourceDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
