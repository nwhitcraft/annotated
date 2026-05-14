import { useEffect, useMemo, useState } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Composer from './components/Composer.jsx';
import DetailView from './components/DetailView.jsx';
import FeedView from './components/FeedView.jsx';
import LibraryView from './components/LibraryView.jsx';
import ProfileView from './components/ProfileView.jsx';
import QuickClipOverlay from './components/QuickClipOverlay.jsx';
import SettingsView from './components/SettingsView.jsx';
import AccessibilityPrompt from './components/AccessibilityPrompt.jsx';
import {
  addLocalComment,
  checkAccessibilityPermission,
  checkAuth,
  clearToken,
  deleteAnnotation,
  exportAnnotation,
  getCachedUser,
  listAnnotations,
  loadSettings,
  openAccessibilitySettings,
  openAuthUrl,
  postAnnotation,
  readSelectedText,
  saveAnnotation,
  setAuthTokenFromCallback,
  startDetachedScreenClip,
  showAppWindow,
} from './lib/localStore.js';

const views = [
  { key: 'compose', label: 'Compose' },
  { key: 'feed', label: 'Feed' },
  { key: 'library', label: 'Library' },
  { key: 'profile', label: 'Profile' },
  { key: 'detail', label: 'Detail' },
  { key: 'settings', label: 'Account' },
];

export default function App() {
  const [activeView, setActiveView] = useState(getCachedUser() ? 'compose' : 'settings');
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
  const [profileKey, setProfileKey] = useState(getCachedUser()?.username || '');
  const [quickClip, setQuickClip] = useState(null);
  const [showAccessibilityPrompt, setShowAccessibilityPrompt] = useState(false);

  function startScreenClip() {
    setEditing(null);
    setQuickClip(null);
    setActiveView('compose');
    setScreenCaptureIntent((value) => value + 1);
  }

  function screenClipResultToDraft(result) {
    if (!result?.ok || !result.outputPath) return null;
    const duration = result.durationSeconds || 90;
    return {
      source_url: 'screen://local',
      source_type: 'screen',
      source_title: 'Screen recording',
      source_domain: '',
      source_thumbnail: '',
      clip_text: `Screen recording attached (${duration}s, 90s max).`,
      clip_start_sec: 0,
      clip_end_sec: duration,
      clip_media_path: result.outputPath,
      commentary: '',
      annotation_type: 'Opinion',
      tags: [],
      is_public: 0,
    };
  }

  function selectedTextFromFocusedElement() {
    const active = document.activeElement;
    if (active && typeof active.value === 'string' && Number.isInteger(active.selectionStart) && Number.isInteger(active.selectionEnd)) {
      const selected = active.value.slice(active.selectionStart, active.selectionEnd).trim();
      if (selected) return selected;
    }
    const selected = window.getSelection?.().toString().trim();
    return selected || '';
  }

  async function startGlobalClip() {
    setEditing(null);
    const localSelection = selectedTextFromFocusedElement();
    if (localSelection) {
      await showAppWindow();
      setQuickClip({ quote: localSelection });
      setStatus('Selection ready to annotate');
      return;
    }

    // Check accessibility permission before attempting text capture
    let hasAccessibility = false;
    try {
      hasAccessibility = await checkAccessibilityPermission();
    } catch {
      // Non-macOS or Tauri unavailable — proceed to screen clip
    }

    if (hasAccessibility) {
      try {
        const selected = String(await readSelectedText() || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (selected) {
          await showAppWindow();
          setQuickClip({ quote: selected });
          setStatus('Selection ready to annotate');
          return;
        }
      } catch (error) {
        console.warn('Selected text capture failed:', error);
      }
    } else {
      // Show accessibility prompt if user hasn't dismissed it permanently
      const dismissed = window.localStorage.getItem('annotated.accessibility_prompt_dismissed');
      if (!dismissed) {
        await showAppWindow();
        setShowAccessibilityPrompt(true);
        setStatus('Accessibility permission needed for text capture');
        return;
      }
    }

    // Fallback: screen recording
    try {
      await startDetachedScreenClip();
      setStatus('Screen clip recording');
    } catch (error) {
      await showAppWindow();
      setStatus(error.message || 'Could not start screen clip');
    }
  }

  useEffect(() => {
    refresh();
    loadSettings().then((value) => {
      setSettings(value);
      checkAuth(value).then((result) => {
        if (result.user) {
          setAuthUser(result.user);
          setProfileKey(result.user.username || result.user.id);
          setStatus(`Signed in as ${result.user.display_name || result.user.username}`);
        } else {
          setAuthUser(null);
          setProfileKey('');
          setActiveView('settings');
          setStatus('Sign in to continue');
        }
      });
    });
  }, []);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    async function setupDeepLinks() {
      try {
        const startUrls = await getCurrent();
        if (!cancelled && startUrls?.length) {
          await connectCallback(startUrls[0]);
        }
        unlisten = await onOpenUrl((urls) => {
          const callbackUrl = urls.find((url) => String(url).startsWith('annotated://callback'));
          if (callbackUrl) void connectCallback(callbackUrl);
        });
      } catch {
        // Browser preview and older dev builds do not expose deep-link events.
      }
    }

    void setupDeepLinks();
    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.apiEndpoint]);

  useEffect(() => {
    const unlisteners = [];
    (async () => {
      try {
        unlisteners.push(await listen('tray-start-screen-clip', () => {
          void startGlobalClip();
        }));
        unlisteners.push(await listen('tray-stop-screen-clip', () => {
          setScreenStopIntent((value) => value + 1);
        }));
        unlisteners.push(await listen('desktop-detached-screen-clip-started', async () => {
          try {
            await getCurrentWindow().hide();
          } catch {
            // Browser previews and some dev shells do not expose native window controls.
          }
          setStatus('Screen clip recording');
        }));
        unlisteners.push(await listen('desktop-screen-clip-finished', async (event) => {
          try {
            const result = event.payload;
            const draft = screenClipResultToDraft(result);
            await showAppWindow();
            if (!draft) {
              setStatus('Screen clip did not produce a file');
              return;
            }
            setEditing(draft);
            setQuickClip(null);
            setActiveView('compose');
            setStatus('Screen clip attached');
          } catch (error) {
            setStatus(error.message || 'Could not attach screen clip');
          }
        }));
        unlisteners.push(await listen('desktop-screen-clip-cancelled', () => {
          setStatus('Screen clip cancelled');
        }));
      } catch (err) {
        console.error('Failed to register desktop event listener:', err);
      }
    })();
    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const key = String(event.key || '').toLowerCase();
      const isX = key === 'x' || event.code === 'KeyX';
      if (event.repeat || !isX || !event.shiftKey || (!event.altKey && !event.ctrlKey)) return;
      event.preventDefault();
      event.stopPropagation();
      void startGlobalClip();
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
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

  async function saveQuickClip(item, publishNow = false) {
    const saved = await saveAnnotation(item);
    setStatus('Saved locally');
    await refresh(saved.id);
    setActiveId(saved.id);
    if (publishNow) await post(saved.id);
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

  async function signIn(provider) {
    const providerName = provider === 'google' ? 'Google' : 'X';
    try {
      setStatus(`Opening ${providerName} sign-in in your browser...`);
      await openAuthUrl(provider, settings);
      setStatus('Browser sign-in opened. Annotated will connect automatically after OAuth.');
      setProfileKey('');
      setActiveView('settings');
    } catch (error) {
      setStatus(error.message || `Could not open ${providerName} sign-in.`);
      setActiveView('settings');
    }
  }

  async function connectCallback(value) {
    setAuthTokenFromCallback(value);
    const result = await checkAuth(settings);
    if (result.user) {
      setAuthUser(result.user);
      setProfileKey(result.user.username || result.user.id);
      setStatus(`Signed in as ${result.user.display_name || result.user.username}`);
      setActiveView('compose');
      return result.user;
    }
    throw new Error(result.error || 'Could not verify token');
  }

  function signOut() {
    clearToken();
    setAuthUser(null);
    setEditing(null);
    setProfileKey('');
    setActiveView('settings');
    setStatus('Signed out. Sign in to continue.');
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

  function openProfile(usernameOrId) {
    if (!authUser) {
      setActiveView('settings');
      setStatus('Sign in to view your profile');
      return;
    }
    setProfileKey(usernameOrId || authUser?.username || authUser?.id || '');
    setActiveView('profile');
  }

  function openView(viewKey) {
    if (!authUser && viewKey !== 'settings') {
      setActiveView('settings');
      setStatus('Sign in to continue');
      return;
    }
    if (viewKey === 'profile') setProfileKey(authUser?.username || authUser?.id || '');
    setActiveView(viewKey);
  }

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <a className="wordmark">annotated</a>
        <nav>
          {views.map((view) => (
            <button
              key={view.key}
              className={activeView === view.key ? 'active' : ''}
              onClick={() => openView(view.key)}
            >
              {view.label}
            </button>
          ))}
        </nav>
        <p className="hotkey-hint">⌥⇧X clips</p>
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
        {activeView === 'feed' && (
          <FeedView
            settings={settings}
            authUser={authUser}
            onOpenProfile={openProfile}
            onSignIn={signIn}
            onStatus={setStatus}
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
        {activeView === 'profile' && (
          <ProfileView
            authUser={authUser}
            profileKey={profileKey}
            settings={settings}
            onAuthUser={(user) => {
              setAuthUser(user);
              setProfileKey(user?.username || user?.id || '');
            }}
            onSignIn={signIn}
            onCallback={connectCallback}
            onSignOut={signOut}
            onOpenProfile={openProfile}
            onStatus={setStatus}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            authUser={authUser}
            onSignIn={signIn}
            onCallback={connectCallback}
            onSignOut={signOut}
          />
        )}
      </main>

      {quickClip && (
        <QuickClipOverlay
          quote={quickClip.quote}
          authUser={authUser}
          onClose={() => setQuickClip(null)}
          onSave={saveQuickClip}
          onSignIn={signIn}
          onStatus={setStatus}
        />
      )}

      <AccessibilityPrompt
        visible={showAccessibilityPrompt}
        onOpenSettings={async () => {
          try { await openAccessibilitySettings(); } catch {}
          setShowAccessibilityPrompt(false);
          setStatus('Open System Settings → Privacy & Security → Accessibility and enable Annotated');
        }}
        onDismiss={() => {
          setShowAccessibilityPrompt(false);
          setStatus('Text capture requires Accessibility permission. Using screen clip instead.');
        }}
        onDontShowAgain={() => {
          window.localStorage.setItem('annotated.accessibility_prompt_dismissed', '1');
          setShowAccessibilityPrompt(false);
          setStatus('Accessibility prompt dismissed. Enable it later in System Settings if needed.');
        }}
      />

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
