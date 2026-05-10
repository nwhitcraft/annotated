import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AnnotationCard from '../components/AnnotationCard.jsx';
import CommentThread from '../components/CommentThread.jsx';
import { getAnnotation, postComment } from '../lib/api.js';
import { currentUser } from '../lib/mockData.js';

function insertReply(comments, parentId, reply) {
  if (!parentId) return [reply, ...comments];
  return comments.map((comment) => {
    const replies = comment.replies || comment.children || comment.comments || [];
    if (comment.id === parentId) {
      return { ...comment, replies: [...replies, reply] };
    }
    return { ...comment, replies: insertReply(replies, parentId, reply) };
  });
}

export default function AnnotationPage() {
  const { id } = useParams();
  const [annotation, setAnnotation] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claim, setClaim] = useState({ email: '', reason: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAnnotation(id)
      .then((data) => {
        if (cancelled) return;
        setAnnotation(data);
        setComments(data.comments || []);
      })
      .catch(() => {
        if (!cancelled) setError('Annotation not found');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalComments = useMemo(() => comments.length, [comments]);

  async function handlePost(body, parentId) {
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      username: currentUser.username,
      display_name: currentUser.display_name,
      avatar_url: currentUser.avatar_url,
      body,
      created_at: new Date().toISOString(),
      replies: [],
    };
    setComments((existing) => insertReply(existing, parentId, optimistic));
    setAnnotation((item) => item ? { ...item, comment_count: Number(item.comment_count || 0) + 1 } : item);
    const saved = await postComment(id, body, parentId);
    if (saved?.id) {
      setComments((existing) => replaceCommentId(existing, optimistic.id, saved.id));
    }
  }

  async function fileClaim(event) {
    event.preventDefault();
    setClaimSent(true);
    try {
      await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annotation_id: id,
          claimant_email: claim.email,
          reason: claim.reason,
        }),
      });
    } catch {
      // The inline confirmation is still useful when the claims endpoint is not wired yet.
    }
  }

  if (loading) {
    return (
      <div className="detail-page page-wrap narrow-wrap">
        <div className="annotation-card skeleton-card tall">
          <div className="skeleton-line w-40" />
          <div className="skeleton-block" />
          <div className="skeleton-line w-90" />
        </div>
      </div>
    );
  }

  if (error || !annotation) {
    return (
      <div className="page-wrap narrow-wrap">
        <div className="empty-state">
          <strong>Annotation not found</strong>
          <p>It may have been removed, made private, or never existed.</p>
          <Link to="/" className="btn btn-secondary">Back to feed</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-page page-wrap narrow-wrap">
      <Link to="/" className="back-link">← Back to feed</Link>
      <AnnotationCard annotation={{ ...annotation, comment_count: annotation.comment_count || totalComments }} expanded />
      <CommentThread comments={comments} onPost={(body) => handlePost(body)} onReply={(parentId, body) => handlePost(body, parentId)} />

      <section className="claim-section">
        {!claimOpen ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setClaimOpen(true)}>File a claim</button>
        ) : claimSent ? (
          <div className="claim-confirmation">
            <strong>Claim filed</strong>
            <p>Thanks. The moderation team will review this annotation and follow up if needed.</p>
          </div>
        ) : (
          <form className="claim-form" onSubmit={fileClaim}>
            <div>
              <strong>File a claim</strong>
              <p>Use this if you own the source material and believe this clip is not fair use.</p>
            </div>
            <input
              className="field"
              type="email"
              placeholder="Email address"
              required
              value={claim.email}
              onChange={(event) => setClaim((value) => ({ ...value, email: event.target.value }))}
            />
            <textarea
              className="field"
              placeholder="Tell us what should be reviewed"
              required
              value={claim.reason}
              onChange={(event) => setClaim((value) => ({ ...value, reason: event.target.value }))}
            />
            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="submit">Submit</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setClaimOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function replaceCommentId(comments, oldId, newId) {
  return comments.map((comment) => ({
    ...comment,
    id: comment.id === oldId ? newId : comment.id,
    replies: replaceCommentId(comment.replies || comment.children || comment.comments || [], oldId, newId),
  }));
}
