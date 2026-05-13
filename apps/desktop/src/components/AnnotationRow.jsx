import SourceType from './SourceType.jsx';
import { formatDate } from '../lib/detect.js';
import { mediaSrc } from '../lib/localStore.js';

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
        {annotation.is_public ? <span className="visibility-state public">Public</span> : <span className="visibility-state private">Private</span>}
      </div>
      <a className="source-title">{annotation.source_title || annotation.source_url}</a>
      {annotation.clip_text && <blockquote>{annotation.clip_text}</blockquote>}
      {annotation.clip_media_path && ['screen', 'youtube'].includes(annotation.source_type) && (
        <video className="media-player" controls preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={mediaSrc(annotation.clip_media_path)} type={annotation.clip_media_path.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
        </video>
      )}
      {annotation.clip_media_path && annotation.source_type === 'podcast' && (
        <audio className="audio-player" controls preload="metadata" onClick={(event) => event.stopPropagation()}>
          <source src={mediaSrc(annotation.clip_media_path)} type="audio/mpeg" />
        </audio>
      )}
      <h2>{annotation.commentary}</h2>
      {annotation.tags?.length > 0 && (
        <p className="tag-row">{annotation.tags.map((tag) => <span key={tag}>{tag}</span>)}</p>
      )}
    </article>
  );
}
