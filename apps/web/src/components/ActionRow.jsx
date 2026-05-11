import { useState } from 'react';
import { fileClaim, getAnnotationClaims, getUsername, toggleLike, toggleNoteworthy } from '../lib/api.js';

export default function ActionRow({ annotation, onOpenComments }) {
  const [liked, setLiked] = useState(Boolean(annotation.liked));
  const [likes, setLikes] = useState(Number(annotation.like_count || 0));
  const [noteworthy, setNoteworthy] = useState(Boolean(annotation.noteworthy));
  const [noteworthyCount, setNoteworthyCount] = useState(Number(annotation.noteworthy_count || 0));
  const [claimCount, setClaimCount] = useState(Number(annotation.claim_count || 0));
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claim, setClaim] = useState({ email: getUsername() ? `${getUsername()}@annotated.local` : '', reason: '' });
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

  async function markNoteworthy(event) {
    event.preventDefault();
    event.stopPropagation();
    const next = !noteworthy;
    setNoteworthy(next);
    setNoteworthyCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const data = await toggleNoteworthy(annotation.id);
      if (typeof data.noteworthy === 'boolean') setNoteworthy(data.noteworthy);
    } catch {
      // Keep the optimistic signal.
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

  async function openClaim(event) {
    event.preventDefault();
    event.stopPropagation();
    setClaimOpen((value) => !value);
    if (!claimOpen) {
      try {
        const data = await getAnnotationClaims(annotation.id);
        setClaimCount(Number(data.count || 0));
      } catch {
        // Existing count is enough for the closed badge.
      }
    }
  }

  async function submitClaim(event) {
    event.preventDefault();
    event.stopPropagation();
    await fileClaim(annotation.id, claim);
    setClaimSent(true);
    setClaimCount((value) => value + 1);
  }

  return (
    <>
      <div className="action-row" aria-label="Annotation actions">
        <button className={liked ? 'is-active' : ''} onClick={like} aria-pressed={liked}>
          <span aria-hidden="true">♡</span>
          {likes}
        </button>
        <button className={noteworthy ? 'is-active' : ''} onClick={markNoteworthy} aria-pressed={noteworthy}>
          <span aria-hidden="true">N</span>
          {noteworthyCount}
        </button>
        <button onClick={comments}>
          <span aria-hidden="true">○</span>
          {annotation.comment_count || 0}
        </button>
        <button className="claim-count" onClick={openClaim}>
          <span aria-hidden="true">!</span>
          {claimCount}
        </button>
        <button onClick={share}>
          <span aria-hidden="true">↗</span>
          {shared ? 'Copied' : 'Share'}
        </button>
      </div>
      {claimOpen && (
        <form className="claim-form inline-claim-form" onSubmit={submitClaim} onClick={(event) => event.stopPropagation()}>
          {claimSent ? (
            <p className="claim-confirmation">Claim filed. We will review it shortly.</p>
          ) : (
            <>
              <strong>File a claim</strong>
              <input className="field" type="email" placeholder="Email address" required value={claim.email} onChange={(event) => setClaim((value) => ({ ...value, email: event.target.value }))} />
              <textarea className="field" placeholder="Describe the issue" required value={claim.reason} onChange={(event) => setClaim((value) => ({ ...value, reason: event.target.value }))} />
              <div className="form-actions">
                <button className="button button-solid" type="submit">Submit</button>
                <button className="button button-text" type="button" onClick={() => setClaimOpen(false)}>Cancel</button>
              </div>
            </>
          )}
        </form>
      )}
    </>
  );
}
