const config = {
  article: { label: 'article', className: 'source-article' },
  youtube: { label: 'video', className: 'source-youtube' },
  podcast: { label: 'podcast', className: 'source-podcast' },
  twitter: { label: 'x post', className: 'source-twitter' },
};

export default function SourceType({ type = 'article' }) {
  const item = config[type] || config.article;
  return (
    <span className={`source-type ${item.className}`}>
      <span aria-hidden="true" />
      {item.label}
    </span>
  );
}
