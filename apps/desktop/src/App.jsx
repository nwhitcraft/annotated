import { useEffect, useMemo, useState } from 'react';
import Composer from './components/Composer.jsx';
import DetailView from './components/DetailView.jsx';
import LibraryView from './components/LibraryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import {
  addLocalComment,
  deleteAnnotation,
  exportAnnotation,
  listAnnotations,
  loadSettings,
  postAnnotation,
  saveAnnotation,
  saveSettings,
} from './lib/localStore.js';

const views = [
  { key: 'compose', label: 'Compose' },
  { key: 'library', label: 'Library' },
  { key: 'detail', label: 'Detail' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const [activeView, setActiveView] = useState('compose');
  const [annotations, setAnnotations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    refresh();
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setEditing(null);
        setActiveView('compose');
      }
      if (event.key === 'Escape') setContextMenu(null);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', () => setContextMenu(null));
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', () => setContextMenu(null));
    };
  }, []);

  async function refresh(nextActiveId) {
    const rows = await listAnnotations();
    setAnnotations(rows);
    if (nextActiveId) setActiveId(nextActiveId);
    else if (!activeId && rows[0]) setActiveId(rows[0].id);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const tag = tagFilter.trim().toLowerCase();
    return annotations.filter((item) => {
      const haystack = `${item.source_title} ${item.source_domain} ${item.clip_text} ${item.commentary} ${(item.tags || []).join(' ')}`.toLowerCase();
      const typeOk = typeFilter === 'all' || item.source_type === typeFilter;
      const searchOk = !term || haystack.includes(term);
      const tagOk = !tag || (item.tags || []).some((value) => value.toLowerCase().includes(tag));
      return typeOk && searchOk && tagOk;
    });
  }, [annotations, search, typeFilter, tagFilter]);

  const activeAnnotation = annotations.find((item) => item.id === activeId) || null;

  async function save(item) {
    const saved = await saveAnnotation(item);
    setStatus('Saved locally');
    await refresh(saved.id);
    setEditing(null);
    setActiveView('detail');
    return saved;
  }

  async function post(id) {
    const posted = await postAnnotation(id);
    setStatus('Marked as posted');
    await refresh(posted?.id || id);
  }

  async function remove(id) {
    await deleteAnnotation(id);
    setStatus('Deleted');
    setActiveId(null);
    await refresh();
  }

  async function updateTags(annotation, tags) {
    const saved = await saveAnnotation({ ...annotation, tags, conflict_version: Number(annotation.conflict_version || 1) + 1 });
    setStatus('Tags updated');
    await refresh(saved.id);
  }

  async function addComment(id, body) {
    const saved = await addLocalComment(id, body);
    setStatus('Comment saved locally');
    await refresh(saved.id);
  }

  async function exportItem(annotation) {
    await exportAnnotation(annotation);
    setStatus('Export copied to clipboard');
  }

  function open(annotation) {
    setActiveId(annotation.id);
    setActiveView('detail');
  }

  function openMenu(annotation, x, y) {
    setContextMenu({ annotation, x, y });
  }

  function edit(annotation) {
    setEditing(annotation);
    setActiveView('compose');
    setContextMenu(null);
  }

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <a className="wordmark">annotated</a>
        <nav>
          {views.map((view) => (
            <button key={view.key} className={activeView === view.key ? 'active' : ''} onClick={() => setActiveView(view.key)}>
              {view.label}
            </button>
          ))}
        </nav>
        <p className="hotkey-hint">⌘⇧A opens the composer</p>
      </aside>

      <main className="workspace">
        {activeView === 'compose' && <Composer editing={editing} onSave={save} onPost={post} />}
        {activeView === 'library' && (
          <LibraryView
            annotations={filtered}
            activeId={activeId}
            search={search}
            typeFilter={typeFilter}
            tagFilter={tagFilter}
            onSearch={setSearch}
            onTypeFilter={setTypeFilter}
            onTagFilter={setTagFilter}
            onOpen={open}
            onContext={openMenu}
          />
        )}
        {activeView === 'detail' && (
          <DetailView annotation={activeAnnotation} onPost={post} onDelete={remove} onExport={exportItem} onTagsChange={updateTags} onComment={addComment} />
        )}
        {activeView === 'settings' && <SettingsView settings={settings} onChange={setSettings} onSave={async (value) => { await saveSettings(value); setStatus('Settings saved'); }} />}
      </main>

      <footer className="status-bar">
        <span>{status}</span>
        <span>{annotations.filter((item) => !item.is_public).length} local drafts</span>
      </footer>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => edit(contextMenu.annotation)}>Edit</button>
          <button onClick={() => { remove(contextMenu.annotation.id); setContextMenu(null); }}>Delete</button>
          <button onClick={() => { post(contextMenu.annotation.id); setContextMenu(null); }}>Post</button>
          <button onClick={() => { exportItem(contextMenu.annotation); setContextMenu(null); }}>Export</button>
        </div>
      )}
    </div>
  );
}
