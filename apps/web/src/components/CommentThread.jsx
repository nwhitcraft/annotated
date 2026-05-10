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
  const user = {
    username: comment.username,
    display_name: comment.display_name,
    avatar_url: comment.avatar_url,
  };

  async function submitReply(body) {
    await onReply(comment.id, body);
    setReplying(false);
    setExpanded(true);
  }

  return (
    <div className={`comment-node comment-depth-${visualDepth}`}>
      <div className="comment-rail" aria-hidden="true" />
      <div className="comment-shell">
        <UserAvatar user={user} size="sm" />
        <div className="comment-content">
          <div className="comment-meta">
            <strong>{comment.display_name || comment.username || 'Anonymous'}</strong>
            <span>@{comment.username || 'anon'}</span>
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
            <div className="comment-reply-box">
              <CommentInput placeholder={`Reply to ${comment.display_name || comment.username}...`} buttonLabel="Post reply" autoFocus onSubmit={submitReply} />
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

export default function CommentThread({ comments = [], onReply, onPost }) {
  return (
    <section className="thread-section" id="comments">
      <div className="thread-heading">
        <span>Thread</span>
        <strong>{countReplies(comments)} replies</strong>
      </div>
      <CommentInput placeholder="Add context, disagreement, or a better source..." buttonLabel="Post comment" onSubmit={(body) => onPost(body)} />
      <div className="comment-thread">
        {comments.length === 0 ? (
          <div className="empty-thread">
            <strong>No replies yet</strong>
            <p>Start the conversation with a specific point, not just a vibe.</p>
          </div>
        ) : (
          comments.map((comment) => <CommentNode key={comment.id} comment={comment} onReply={onReply} />)
        )}
      </div>
    </section>
  );
}
