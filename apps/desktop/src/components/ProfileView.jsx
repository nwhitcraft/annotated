import { useEffect, useState } from 'react';
import {
  getCurrentUserId,
  getUser,
  getUserAnnotations,
  getCachedUser,
  toggleLike,
  toggleFollow,
  toggleNoteworthy,
  updateProfile,
  uploadAvatar,
} from '../lib/localStore.js';
import PublicAnnotationCard from './PublicAnnotationCard.jsx';
import UserAvatar from './UserAvatar.jsx';

export default function ProfileView({
  authUser,
  profileKey,
  settings,
  onAuthUser,
  onSignIn,
  onCallback,
  onSignOut,
  onOpenProfile,
  onStatus,
}) {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('annotations');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profileForm(null));
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [callbackValue, setCallbackValue] = useState('');
  const [error, setError] = useState('');
  const target = profileKey || authUser?.username || authUser?.id || '';

  useEffect(() => {
    if (!target) {
      setUser(null);
      setItems([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    getUser(target, settings)
      .then(async (profile) => {
        const annotations = await getUserAnnotations(profile.id, tab, settings);
        if (cancelled) return;
        setUser(profile);
        setForm(profileForm(profile));
        setAvatarPreview(profile.avatar_url || '');
        setItems(annotations);
      })
      .catch((err) => {
        if (!cancelled) {
          setUser(null);
          setItems([]);
          setError(err.message || 'Could not load profile');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, tab, settings?.apiEndpoint, authUser?.id]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(user?.avatar_url || '');
      return undefined;
    }
    const preview = URL.createObjectURL(avatarFile);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatarFile, user?.avatar_url]);

  const isSelf = Boolean(user && authUser && (user.id === authUser.id || user.id === getCurrentUserId()));

  async function connectAccount(event) {
    event.preventDefault();
    setError('');
    try {
      const connected = await onCallback(callbackValue);
      setCallbackValue('');
      onAuthUser?.(connected);
      onStatus?.(`Signed in as ${connected.display_name || connected.username}`);
    } catch (err) {
      setError(err.message || 'Could not connect account');
    }
  }

  async function follow() {
    if (!authUser) {
      onSignIn?.('google');
      return;
    }
    setUser((current) => ({ ...current, following: !current.following }));
    try {
      const data = await toggleFollow(user.id, settings);
      if (typeof data.following === 'boolean') {
        setUser((current) => ({ ...current, following: data.following }));
      }
    } catch {
      setUser((current) => ({ ...current, following: !current.following }));
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!user) return;
    setError('');
    try {
      let avatarUrl = form.avatar_url;
      if (avatarFile) {
        const upload = await uploadAvatar(avatarFile, user.id, settings);
        avatarUrl = upload.avatar_url || avatarUrl;
      }
      const updated = await updateProfile(user.id, {
        display_name: user.display_name || user.username,
        bio: form.bio,
        avatar_url: avatarUrl || null,
        link: form.link,
        twitter_handle: form.twitter_handle,
      }, settings);
      const nextUser = { ...user, ...updated };
      setUser(nextUser);
      setForm(profileForm(nextUser));
      setAvatarFile(null);
      setEditing(false);
      if (isSelf) onAuthUser?.({ ...getCachedUser(), ...nextUser });
      onStatus?.('Profile saved');
    } catch (err) {
      setError(err.message || 'Could not save profile');
    }
  }

  if (!target && !authUser) {
    return (
      <section className="profile-view">
        <header className="section-heading">
          <div>
            <p>Account</p>
            <h2>Sign in to Annotated</h2>
          </div>
        </header>
        <AuthConnect
          callbackValue={callbackValue}
          error={error}
          onCallbackValue={setCallbackValue}
          onConnect={connectAccount}
          onSignIn={onSignIn}
        />
      </section>
    );
  }

  if (loading) {
    return (
      <section className="profile-view">
        <div className="skeleton-item">
          <div className="skeleton-line short" />
          <div className="skeleton-line headline" />
          <div className="skeleton-block" />
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="profile-view">
        <div className="empty-state">
          <strong>{error || 'User not found.'}</strong>
          <p>This profile does not exist yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-view">
      <header className="profile-header">
        <div className="profile-identity">
          <UserAvatar user={user} size="lg" />
          <div>
            <h1>{user.display_name || user.username}</h1>
            <p>@{user.username}</p>
          </div>
        </div>
        <div className="profile-actions">
          {isSelf ? (
            <>
              <button className="button button-outline" onClick={() => setEditing((value) => !value)}>Edit Profile</button>
              <button className="button button-text danger" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <button className="button button-outline" onClick={follow}>{user.following ? 'Following' : 'Follow'}</button>
          )}
        </div>
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {(user.link || user.twitter_handle) && (
          <p className="profile-links">
            {user.link && <a href={user.link} target="_blank" rel="noreferrer">{cleanUrlLabel(user.link)}</a>}
            {user.twitter_handle && <a href={`https://x.com/${user.twitter_handle}`} target="_blank" rel="noreferrer">@{user.twitter_handle}</a>}
          </p>
        )}
        <p className="profile-stats">
          <strong>{Number(user.stats?.annotations || 0).toLocaleString()}</strong> annotations · <strong>{Number(user.stats?.followers || 0).toLocaleString()}</strong> followers · <strong>{Number(user.stats?.following || 0).toLocaleString()}</strong> following · <strong>{Number(user.stats?.credibility || user.credibility_score || 0).toLocaleString()}</strong> credibility
        </p>
      </header>

      {isSelf && editing && (
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-edit-card">
            <UserAvatar user={{ ...user, avatar_url: avatarPreview }} size="lg" />
            <div>
              <strong>{user.display_name || user.username}</strong>
              <span>@{user.username}</span>
              <label className="change-picture-button">
                Change picture
                <input type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
          <label>
            Bio
            <textarea maxLength="280" value={form.bio} onChange={(event) => updateField('bio', event.target.value)} />
            <small className="field-counter">{form.bio.length}/280</small>
          </label>
          <div className="profile-form-grid">
            <label>
              Link
              <input type="url" value={form.link} onChange={(event) => updateField('link', event.target.value)} placeholder="https://example.com" />
            </label>
            <label>
              X handle
              <input value={form.twitter_handle} onChange={(event) => updateField('twitter_handle', event.target.value.replace(/^@+/, ''))} placeholder="username" />
            </label>
          </div>
          {error && <p className="composer-error">{error}</p>}
          <div className="detail-actions">
            <button className="button button-solid" type="submit">Save profile</button>
            <button className="button button-text" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      <nav className="visibility-tabs profile-tabs" aria-label="Profile tabs">
        <button className={tab === 'annotations' ? 'active' : ''} onClick={() => setTab('annotations')}>Annotations</button>
        <button className={tab === 'liked' ? 'active' : ''} onClick={() => setTab('liked')}>Liked</button>
      </nav>

      {items.length === 0 ? (
        <div className="empty-state">
          <strong>No {tab === 'liked' ? 'liked annotations' : 'annotations'} yet.</strong>
          <p>This section is still quiet.</p>
        </div>
      ) : (
        <div className="ruled-list">
          {items.map((annotation) => (
            <PublicAnnotationCard
              key={annotation.id}
              annotation={annotation}
              authUser={authUser}
              onOpenProfile={onOpenProfile}
              onRequireAuth={() => onSignIn?.('google')}
              onToggleLike={(id) => toggleLike(id, settings)}
              onToggleNoteworthy={(id) => toggleNoteworthy(id, settings)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AuthConnect({ callbackValue, error, compact, onCallbackValue, onConnect, onSignIn }) {
  const [showFallback, setShowFallback] = useState(false);

  return (
    <section className={`auth-card ${compact ? 'auth-card-compact' : ''}`}>
      <div>
        <p>Login</p>
        <h3>Connect your Annotated account</h3>
        <p>We will open your browser for OAuth, then return here automatically when sign-in finishes.</p>
      </div>
      <div className="auth-actions auth-actions-stacked">
        <button className="oauth-button" type="button" onClick={() => onSignIn?.('google')}>
          <span className="oauth-mark" aria-hidden="true"><GoogleMark /></span>
          <span>Continue with Google</span>
        </button>
        <button className="oauth-button" type="button" onClick={() => onSignIn?.('twitter')}>
          <span className="oauth-mark" aria-hidden="true"><XMark /></span>
          <span>Continue with X</span>
        </button>
      </div>
      {!showFallback ? (
        <button className="button button-text callback-fallback-link" type="button" onClick={() => setShowFallback(true)}>
          Having trouble signing in?
        </button>
      ) : (
        <form className="callback-form callback-fallback-panel" onSubmit={onConnect}>
          <p className="callback-fallback-note">
            Annotated normally reconnects by itself. Paste the callback URL only if your browser finishes sign-in but macOS does not switch back to the app.
          </p>
          <label>
            Callback URL
            <input
              value={callbackValue}
              onChange={(event) => onCallbackValue(event.target.value)}
              placeholder="annotated://callback?token=..."
            />
          </label>
          <button className="button button-solid" type="submit" disabled={!callbackValue.trim()}>
            Connect account
          </button>
        </form>
      )}
      {error && <p className="composer-error">{error}</p>}
    </section>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.37 12 5.37z" />
    </svg>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.9 2.25h3.32l-7.26 8.3 8.54 11.2h-6.68l-5.24-6.82-5.98 6.82H2.27l7.76-8.87L1.84 2.25h6.85l4.73 6.25 5.48-6.25Zm-1.16 17.55h1.84L7.68 4.1H5.7l12.04 15.7Z" />
    </svg>
  );
}

function profileForm(user) {
  return {
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    link: user?.link || '',
    twitter_handle: user?.twitter_handle || '',
  };
}

function cleanUrlLabel(value) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}
