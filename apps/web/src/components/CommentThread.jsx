import { useMemo, useState } from 'react';
import CommentInput from './CommentInput.jsx';
import UserAvatar from './UserAvatar.jsx';
import { timeAgo } from '../lib/format.js';

function repliesFor(comment) {
  return comment.replies || comment.children || comment.comments || [];
}

function countReplies(comments = []) {
  return comments.reduce((total, comment) => total + 1 + countReplies(repliesFor(comment)), 0);
}

function CommentNode({ comment, depth = 0, onReply }) {
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(depth < 1);
  const replies = repliesFor(comment);
  const hiddenCount = useMemo(() => countReplies(replies), [replies]);
  const visualDepth = Math.min(depth, 2);
  const user = { username: comment.username, display_name: comment.display_name, avatar_url: comment.avatar_url };

  async function submitReply(body) {
    await onReply(comment.id, body);
    setReplying(false);
    setExpanded(true);
  }

  return (
    <div className={`comment-node comment-depth-${visualDepth}`}>
      <div className="comment-body">
        <UserAvatar user={user} size="sm" />
        <div>
          <div className="comment-meta">
            <strong>{comment.display_name || comment.username || 'Anonymous'}</strong>
            <span>{timeAgo(comment.created_at)}</span>
          </div>
          <p>{comment.body}</p>
          <div className="comment-actions">
            <button onClick={() => setReplying((value) => !value)}>Reply</button>
            {replies.length > 0 && (
              <button onClick={() => setExpanded((value) => !value)}>
                {expanded ? 'Hide replies' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
              </button>
            )}
          </div>
          {replying && (
            <div className="reply-input-wrap">
              <CommentInput placeholder={`Reply to ${comment.display_name || comment.username}...`} buttonLabel="Reply" autoFocus onSubmit={submitReply} />
            </div>
          )}
        </div>
      </div>
      {expanded && replies.length > 0 && (
        <div className="comment-children">
          {replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ comments = [], onPost, onReply }) {
  return (
    <section className="thread-section" id="comments">
      <header className="section-header">
        <h2>Replies</h2>
        <span>{countReplies(comments)} total</span>
      </header>
      <CommentInput placeholder="Add a careful reply..." onSubmit={(body) => onPost(body)} />
      <div className="comment-thread">
        {comments.length === 0 ? (
          <div className="empty-state">
            <strong>No replies yet.</strong>
            <p>Be the first to add context to this annotation.</p>
          </div>
        ) : (
          comments.map((comment) => <CommentNode key={comment.id} comment={comment} onReply={onReply} />)
        )}
      </div>
    </section>
  );
}
