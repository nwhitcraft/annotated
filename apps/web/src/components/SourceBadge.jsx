const sourceConfig = {
  article: { icon: 'Article', label: 'Article', className: 'source-article' },
  youtube: { icon: 'Video', label: 'Video', className: 'source-youtube' },
  podcast: { icon: 'Audio', label: 'Podcast', className: 'source-podcast' },
};

export default function SourceBadge({ type = 'article' }) {
  const config = sourceConfig[type] || sourceConfig.article;
  return (
    <span className={`source-badge ${config.className}`}>
      <span className="source-dot" aria-hidden="true" />
      {config.label}
    </span>
  );
}
