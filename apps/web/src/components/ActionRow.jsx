import { useState } from 'react';
import { toggleLike } from '../lib/api.js';

export default function ActionRow({ annotation, onOpenComments }) {
  const [liked, setLiked] = useState(Boolean(annotation.liked));
  const [likes, setLikes] = useState(Number(annotation.like_count || 0));
  const [shared, setShared] = useState(false);

  async function like(event) {
    event.preventDefault();
    event.stopPropagation();
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await toggleLike(annotation.id);
      if (typeof data.liked === 'boolean') setLiked(data.liked);
    } catch {
      // Keep the optimistic editorial tap.
    }
  }

  function comments(event) {
    event.preventDefault();
    event.stopPropagation();
    onOpenComments?.();
  }

  async function share(event) {
    event.preventDefault();
    event.stopPropagation();
    const href = `${window.location.origin}/a/${annotation.id}`;
    try {
      await navigator.clipboard.writeText(href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1300);
    } catch {
      window.location.href = `mailto:?subject=Annotated&body=${encodeURIComponent(href)}`;
    }
  }

  return (
    <div className="action-row" aria-label="Annotation actions">
      <button className={liked ? 'is-active' : ''} onClick={like} aria-pressed={liked}>
        <span aria-hidden="true">♡</span>
        {likes}
      </button>
      <button onClick={comments}>
        <span aria-hidden="true">○</span>
        {annotation.comment_count || 0}
      </button>
      <button onClick={share}>
        <span aria-hidden="true">↗</span>
        {shared ? 'Copied' : 'Share'}
      </button>
    </div>
  );
}
