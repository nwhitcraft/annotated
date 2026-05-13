import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import Composer from './components/Composer.jsx';
import DetailView from './components/DetailView.jsx';
import LibraryView from './components/LibraryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import {
  addLocalComment,
  authUrl,
  checkAuth,
  deleteAnnotation,
  exportAnnotation,
  getCachedUser,
  listAnnotations,
  loadSettings,
  postAnnotation,
  saveAnnotation,
  saveSettings,
  setAuthTokenFromCallback,
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
  const [authUser, setAuthUser] = useState(getCachedUser());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('private');
  const [tagFilter, setTagFilter] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [screenCaptureIntent, setScreenCaptureIntent] = useState(0);
  const [screenStopIntent, setScreenStopIntent] = useState(0);

  useEffect(() => {
    refresh();
    loadSettings().then((value) => {
      setSettings(value);
      checkAuth(value).then((result) => {
        if (result.user) {
          setAuthUser(result.user);
          setStatus(`Signed in as ${result.user.display_name || result.user.username}`);
        }
      });
    });
  }, []);

  useEffect(() => {
    const unlisteners = [];
    (async () => {
      try {
        unlisteners.push(await listen('shortcut:composer-toggle', () => {
          setEditing(null);
          setActiveView('compose');
        }));
        unlisteners.push(await listen('tray-start-screen-clip', () => {
          setEditing(null);
          setActiveView('compose');
          setScreenCaptureIntent((value) => value + 1);
        }));
        unlisteners.push(await listen('tray-stop-screen-clip', () => {
          setScreenStopIntent((value) => value + 1);
        }));
      } catch (err) {
        console.error('Failed to register desktop event listener:', err);
      }
    })();
    return () => {
      unlisteners.forEach((unlisten) => unlisten());
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
      const visibilityOk = visibilityFilter === 'all'
        || (visibilityFilter === 'public' ? Number(item.is_public) === 1 : Number(item.is_public || 0) === 0);
      const searchOk = !term || haystack.includes(term);
      const tagOk = !tag || (item.tags || []).some((value) => value.toLowerCase().includes(tag));
      return typeOk && visibilityOk && searchOk && tagOk;
    });
  }, [annotations, search, typeFilter, visibilityFilter, tagFilter]);

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
    try {
      const posted = await postAnnotation(id);
      setStatus('Published to Annotated feed');
      await refresh(posted?.id || id);
    } catch (error) {
      setStatus(error.message || 'Could not publish');
      throw error;
    }
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

  function signIn(provider) {
    window.open(authUrl(provider, settings), '_blank', 'noopener,noreferrer');
    setStatus('Opened browser sign-in. Paste the annotated://callback URL here when it returns.');
    setActiveView('settings');
  }

  async function connectCallback(value) {
    setAuthTokenFromCallback(value);
    const result = await checkAuth(settings);
    if (result.user) {
      setAuthUser(result.user);
      setStatus(`Signed in as ${result.user.display_name || result.user.username}`);
      return result.user;
    }
    throw new Error(result.error || 'Could not verify token');
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
        {activeView === 'compose' && (
          <Composer
            editing={editing}
            authUser={authUser}
            onSave={save}
            onPost={post}
            onSignIn={signIn}
            onStatus={setStatus}
            screenCaptureIntent={screenCaptureIntent}
            screenStopIntent={screenStopIntent}
          />
        )}
        {activeView === 'library' && (
          <LibraryView
            annotations={filtered}
            activeId={activeId}
            search={search}
            typeFilter={typeFilter}
            visibilityFilter={visibilityFilter}
            tagFilter={tagFilter}
            onSearch={setSearch}
            onTypeFilter={setTypeFilter}
            onVisibilityFilter={setVisibilityFilter}
            onTagFilter={setTagFilter}
            onOpen={open}
            onContext={openMenu}
          />
        )}
        {activeView === 'detail' && (
          <DetailView annotation={activeAnnotation} onPost={post} onDelete={remove} onExport={exportItem} onTagsChange={updateTags} onComment={addComment} />
        )}
        {activeView === 'settings' && (
          <SettingsView
            settings={settings}
            authUser={authUser}
            onChange={setSettings}
            onSignIn={signIn}
            onCallback={connectCallback}
            onSave={async (value) => { await saveSettings(value); setStatus('Settings saved'); }}
          />
        )}
      </main>

      <footer className="status-bar">
        <span>{status}</span>
        <span>{annotations.filter((item) => !item.is_public).length} private · {annotations.filter((item) => item.is_public).length} public</span>
      </footer>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => edit(contextMenu.annotation)}>Edit</button>
          <button onClick={() => { remove(contextMenu.annotation.id); setContextMenu(null); }}>Delete</button>
          <button onClick={() => { post(contextMenu.annotation.id); setContextMenu(null); }}>Make public</button>
          <button onClick={() => { exportItem(contextMenu.annotation); setContextMenu(null); }}>Export</button>
        </div>
      )}
    </div>
  );
}
