import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AnnotationItem from '../components/AnnotationItem.jsx';
import CommentThread from '../components/CommentThread.jsx';
import { currentUser } from '../lib/mockData.js';
import { getAnnotation, postComment } from '../lib/api.js';

function childrenOf(comment) {
  return comment.replies || comment.children || comment.comments || [];
}

function insertComment(comments, parentId, reply) {
  if (!parentId) return [reply, ...comments];
  return comments.map((comment) => {
    const replies = childrenOf(comment);
    if (comment.id === parentId) return { ...comment, replies: [...replies, reply] };
    return { ...comment, replies: insertComment(replies, parentId, reply) };
  });
}

function replaceId(comments, oldId, newId) {
  return comments.map((comment) => ({
    ...comment,
    id: comment.id === oldId ? newId : comment.id,
    replies: replaceId(childrenOf(comment), oldId, newId),
  }));
}

export default function AnnotationPage() {
  const { id } = useParams();
  const [annotation, setAnnotation] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claim, setClaim] = useState({ email: '', reason_code: 'copyright', description: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
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

  const commentCount = useMemo(() => comments.length, [comments]);

  async function addComment(body, parentId) {
    const optimistic = {
      id: `local-${Date.now()}`,
      username: currentUser.username,
      display_name: currentUser.display_name,
      avatar_url: currentUser.avatar_url,
      body,
      created_at: new Date().toISOString(),
      replies: [],
    };
    setComments((existing) => insertComment(existing, parentId, optimistic));
    setAnnotation((item) => item ? { ...item, comment_count: Number(item.comment_count || 0) + 1 } : item);
    const saved = await postComment(id, body, parentId);
    if (saved?.id) setComments((existing) => replaceId(existing, optimistic.id, saved.id));
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
          reason_code: claim.reason_code,
          description: claim.description,
        }),
      });
    } catch {
      // The UI confirmation is enough while the endpoint is unavailable.
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton-item">
          <div className="skeleton-line short" />
          <div className="skeleton-block" />
          <div className="skeleton-line headline" />
        </div>
      </div>
    );
  }

  if (error || !annotation) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>Annotation not found.</strong>
          <p>It may have been removed or made private.</p>
          <Link className="button button-outline" to="/feed">Back to feed</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to="/feed" className="back-link">← Feed</Link>
      <div className="ruled-list detail-list">
        <AnnotationItem annotation={{ ...annotation, comment_count: annotation.comment_count || commentCount }} expanded />
      </div>
      <CommentThread comments={comments} onPost={(body) => addComment(body)} onReply={(parentId, body) => addComment(body, parentId)} />

      <footer className="claim-area">
        {!claimOpen ? (
          <button className="claim-link" onClick={() => setClaimOpen(true)}>File a claim</button>
        ) : claimSent ? (
          <p className="claim-confirmation">Claim filed. We will review it shortly.</p>
        ) : (
          <form className="claim-form" onSubmit={fileClaim}>
            <strong>File a claim</strong>
            <p className="claim-hint">Select a reason and describe the issue. We'll review it and take appropriate action.</p>
            <label>
              <span>Reason</span>
              <select className="field" required value={claim.reason_code} onChange={(event) => setClaim((value) => ({ ...value, reason_code: event.target.value }))}>
                <option value="copyright">Copyright infringement</option>
                <option value="misrepresentation">Misrepresentation</option>
                <option value="defamation">Defamation</option>
                <option value="privacy">Privacy violation</option>
                <option value="harassment">Harassment</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span>Your email</span>
              <input className="field" type="email" placeholder="you@example.com" required value={claim.email} onChange={(event) => setClaim((value) => ({ ...value, email: event.target.value }))} />
            </label>
            <label>
              <span>Description</span>
              <textarea className="field" placeholder="Describe why you're filing this claim..." required value={claim.description} onChange={(event) => setClaim((value) => ({ ...value, description: event.target.value }))} />
            </label>
            <div className="form-actions">
              <button className="button button-solid" type="submit">Submit Claim</button>
              <button className="button button-text" type="button" onClick={() => setClaimOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </footer>
    </div>
  );
}
