import { useState } from 'react';
import SourceType from './SourceType.jsx';

export default function DetailView({ annotation, onPost, onDelete, onExport, onTagsChange, onComment }) {
  const [tags, setTags] = useState((annotation?.tags || []).join(', '));
  const [comment, setComment] = useState('');

  if (!annotation) {
    return (
      <section className="detail-view empty-detail">
        <p>Select an annotation to read it in full.</p>
      </section>
    );
  }

  function saveTags() {
    onTagsChange(annotation, tags.split(',').map((tag) => tag.trim()).filter(Boolean));
  }

  async function addComment() {
    if (!comment.trim()) return;
    await onComment(annotation.id, comment.trim());
    setComment('');
  }

  return (
    <section className="detail-view">
      <header className="detail-header">
        <div className="annotation-meta">
          <strong>{annotation.source_domain}</strong>
          <SourceType type={annotation.source_type} />
          <span>{annotation.is_public ? 'posted' : 'local draft'}</span>
          <span>v{annotation.conflict_version || 1}</span>
        </div>
        <a href={annotation.source_url} target="_blank" rel="noreferrer" className="source-title">{annotation.source_title}</a>
      </header>

      {annotation.clip_text && <blockquote className="detail-quote">{annotation.clip_text}</blockquote>}
      <h1>{annotation.commentary}</h1>

      <div className="tag-editor">
        <label>
          Tags
          <input value={tags} onChange={(event) => setTags(event.target.value)} onBlur={saveTags} />
        </label>
      </div>

      <div className="detail-actions">
        <button className="button button-solid" onClick={() => onPost(annotation.id)}>Post to Feed</button>
        <button className="button button-outline" onClick={() => onExport(annotation)}>Export</button>
        <button className="button button-text danger" onClick={() => onDelete(annotation.id)}>Delete</button>
      </div>

      <section className="local-thread">
        <header className="section-heading">
          <div>
            <p>Local comments</p>
            <h2>Thread</h2>
          </div>
          <span>{annotation.comments?.length || 0}</span>
        </header>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a private note or reply..." />
        <button className="button button-outline" onClick={addComment}>Add comment</button>
        <div className="thread-list">
          {(annotation.comments || []).map((item) => (
            <article key={item.id}>
              <p>{item.body}</p>
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
