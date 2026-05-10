import { useState } from 'react';

export default function CommentInput({ placeholder = 'Add a reply...', buttonLabel = 'Post', autoFocus = false, onSubmit }) {
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
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
      />
      <div className="comment-input-footer">
        <span>{body.length ? `${body.length} characters` : 'Replies should add context.'}</span>
        <button className="button button-solid" type="submit" disabled={!body.trim() || posting}>
          {posting ? 'Posting' : buttonLabel}
        </button>
      </div>
    </form>
  );
}
