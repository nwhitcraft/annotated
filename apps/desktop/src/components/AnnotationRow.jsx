import SourceType from './SourceType.jsx';
import { formatDate } from '../lib/detect.js';

export default function AnnotationRow({ annotation, active, onOpen, onContext }) {
  return (
    <article
      className={`annotation-row ${active ? 'active' : ''}`}
      onClick={() => onOpen(annotation)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContext(annotation, event.clientX, event.clientY);
      }}
    >
      <div className="annotation-meta">
        <strong>{annotation.source_domain}</strong>
        <span>{formatDate(annotation.updated_at)}</span>
        <SourceType type={annotation.source_type} />
        {annotation.is_public ? <span>posted</span> : <span>local</span>}
      </div>
      <a className="source-title">{annotation.source_title || annotation.source_url}</a>
      {annotation.clip_text && <blockquote>{annotation.clip_text}</blockquote>}
      <h2>{annotation.commentary}</h2>
      {annotation.tags?.length > 0 && (
        <p className="tag-row">{annotation.tags.map((tag) => <span key={tag}>{tag}</span>)}</p>
      )}
    </article>
  );
}
