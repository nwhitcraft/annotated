import AnnotationRow from './AnnotationRow.jsx';

export default function LibraryView({ annotations, activeId, search, typeFilter, tagFilter, onSearch, onTypeFilter, onTagFilter, onOpen, onContext }) {
  return (
    <section className="library-view">
      <header className="section-heading">
        <div>
          <p>Library</p>
          <h2>Local annotations</h2>
        </div>
        <span>{annotations.length} saved</span>
      </header>
      <div className="library-filters">
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search library" />
        <select value={typeFilter} onChange={(event) => onTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          <option value="article">Articles</option>
          <option value="youtube">Videos</option>
          <option value="podcast">Podcasts</option>
        </select>
        <input value={tagFilter} onChange={(event) => onTagFilter(event.target.value)} placeholder="Filter tag" />
      </div>
      <div className="ruled-list">
        {annotations.length === 0 ? (
          <div className="empty-state">
            <strong>No local annotations.</strong>
            <p>Save one from the composer to begin your private library.</p>
          </div>
        ) : (
          annotations.map((annotation) => (
            <AnnotationRow key={annotation.id} annotation={annotation} active={annotation.id === activeId} onOpen={onOpen} onContext={onContext} />
          ))
        )}
      </div>
    </section>
  );
}
