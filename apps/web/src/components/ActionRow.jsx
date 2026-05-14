import { useState } from 'react';
import { fileClaim, getAnnotationClaims, toggleLike, toggleNoteworthy } from '../lib/api.js';

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

export default function ActionRow({ annotation, onOpenComments }) {
  const [liked, setLiked] = useState(Boolean(annotation.liked));
  const [likes, setLikes] = useState(Number(annotation.like_count || 0));
  const [noteworthy, setNoteworthy] = useState(Boolean(annotation.noteworthy));
  const [noteworthyCount, setNoteworthyCount] = useState(Number(annotation.noteworthy_count || 0));
  const [claimCount, setClaimCount] = useState(Number(annotation.claim_count || 0));
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claim, setClaim] = useState({ description: '' });

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
    if (claimSubmitting) return;
    setClaimSubmitting(true);
    setClaimError('');
    try {
      await fileClaim(annotation.id, { ...claim, reason_code: 'other' });
      setClaimSent(true);
      setClaimCount((value) => value + 1);
    } catch (err) {
      setClaimError(err.message || 'Could not file report. Please try again.');
    } finally {
      setClaimSubmitting(false);
    }
  }

  return (
    <>
      <div className="action-row" aria-label="Annotation actions">
        <button className={`credible ${liked ? 'is-active' : ''}`} onClick={like} aria-pressed={liked}>
          <ActionIcon type="credible" />
          <span>Credible</span>
          <span className="count">{likes}</span>
        </button>
        <button className={`dispute ${noteworthy ? 'is-active' : ''}`} onClick={markNoteworthy} aria-pressed={noteworthy}>
          <ActionIcon type="disagree" />
          <span>Disagree</span>
          <span className="count">{noteworthyCount}</span>
        </button>
        <button className="comments-action" onClick={comments}>
          <ActionIcon type="comments" />
          <span>Comments</span>
          <span className="count">{annotation.comment_count || 0}</span>
        </button>
        <button className="claims-action claim-count" onClick={openClaim}>
          <ActionIcon type="claims" />
          <span>Reports</span>
          <span className="count">{claimCount}</span>
        </button>
      </div>
      {claimOpen && (
        <form className="claim-form inline-claim-form" onSubmit={submitClaim} onClick={(event) => event.stopPropagation()}>
          {claimSent ? (
            <p className="claim-confirmation">Report filed. We will review it shortly.</p>
          ) : (
            <>
              <strong>File a report</strong>
              <textarea className="field" placeholder="Describe the issue" required value={claim.description} onChange={(event) => setClaim((value) => ({ ...value, description: event.target.value }))} />
              {claimError && <p className="form-error">{claimError}</p>}
              <div className="form-actions">
                <button className="button button-solid" type="submit" disabled={claimSubmitting}>
                  {claimSubmitting ? 'Submitting' : 'Submit'}
                </button>
                <button className="button button-text" type="button" onClick={() => setClaimOpen(false)}>Cancel</button>
              </div>
            </>
          )}
        </form>
      )}
    </>
  );
}
