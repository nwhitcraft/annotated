import { typeLabel } from '../lib/detect.js';

export default function SourceType({ type }) {
  return (
    <span className={`source-type source-${type || 'article'}`}>
      <span aria-hidden="true" />
      {typeLabel(type)}
    </span>
  );
}
