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
  return (
    <section className={`auth-card ${compact ? 'auth-card-compact' : ''}`}>
      <div>
        <p>Login</p>
        <h3>Connect your Annotated account</h3>
      </div>
      <div className="auth-actions">
        <button className="button button-outline" type="button" onClick={() => onSignIn?.('google')}>Google</button>
        <button className="button button-outline" type="button" onClick={() => onSignIn?.('twitter')}>X</button>
      </div>
      <form className="callback-form" onSubmit={onConnect}>
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
      {error && <p className="composer-error">{error}</p>}
    </section>
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
