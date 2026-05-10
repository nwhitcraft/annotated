import { useState } from 'react';
import UserAvatar from './UserAvatar.jsx';
import { currentUser } from '../lib/mockData.js';

export default function CommentInput({ placeholder = 'Add a sharp reply...', buttonLabel = 'Reply', autoFocus = false, onSubmit }) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const value = body.trim();
    if (!value || posting) return;
    setPosting(true);
    await onSubmit(value);
    setBody('');
    setPosting(false);
  }

  return (
    <form className="comment-input" onSubmit={submit}>
      <UserAvatar user={currentUser} size="sm" />
      <div className="comment-input-body">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={3}
        />
        <div className="comment-input-actions">
          <span>{body.length ? `${body.length} characters` : 'Serif replies, social tempo.'}</span>
          <button className="btn btn-primary btn-sm" type="submit" disabled={!body.trim() || posting}>
            {posting ? 'Posting' : buttonLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
