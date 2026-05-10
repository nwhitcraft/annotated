import { useState } from 'react';
import { toggleLike, togglePin } from '../lib/api.js';

export default function ActionBar({ annotation, onOpenComments, dense = false }) {
  const [liked, setLiked] = useState(Boolean(annotation.liked));
  const [pinned, setPinned] = useState(Boolean(annotation.pinned));
  const [likes, setLikes] = useState(Number(annotation.like_count || 0));
  const [pins, setPins] = useState(Number(annotation.pin_count || 0));
  const [shared, setShared] = useState(false);

  async function handleLike(event) {
    event.preventDefault();
    event.stopPropagation();
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await toggleLike(annotation.id);
      if (typeof data.liked === 'boolean') setLiked(data.liked);
    } catch {
      // Optimistic state is good enough for offline/demo mode.
    }
  }

  async function handlePin(event) {
    event.preventDefault();
    event.stopPropagation();
    const next = !pinned;
    setPinned(next);
    setPins((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await togglePin(annotation.id);
      if (typeof data.pinned === 'boolean') setPinned(data.pinned);
    } catch {
      // Keep optimistic state.
    }
  }

  async function handleShare(event) {
    event.preventDefault();
    event.stopPropagation();
    const href = `${window.location.origin}/a/${annotation.id}`;
    try {
      await navigator.clipboard.writeText(href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1400);
    } catch {
      window.location.href = `mailto:?subject=Annotated thread&body=${encodeURIComponent(href)}`;
    }
  }

  function handleComments(event) {
    event.preventDefault();
    event.stopPropagation();
    onOpenComments?.();
  }

  return (
    <div className={`action-bar ${dense ? 'action-bar-dense' : ''}`} aria-label="Annotation actions">
      <button className={`action-btn ${liked ? 'active like-active' : ''}`} onClick={handleLike} aria-pressed={liked}>
        <span aria-hidden="true">♡</span>
        <span>{likes || 'Like'}</span>
      </button>
      <button className="action-btn" onClick={handleComments}>
        <span aria-hidden="true">◇</span>
        <span>{annotation.comment_count || 'Comment'}</span>
      </button>
      <button className={`action-btn ${pinned ? 'active pin-active' : ''}`} onClick={handlePin} aria-pressed={pinned}>
        <span aria-hidden="true">⌖</span>
        <span>{pins || 'Pin'}</span>
      </button>
      <button className="action-btn" onClick={handleShare}>
        <span aria-hidden="true">↗</span>
        <span>{shared ? 'Copied' : 'Share'}</span>
      </button>
    </div>
  );
}
