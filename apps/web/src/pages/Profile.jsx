import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AnnotationItem from '../components/AnnotationItem.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import {
  getCurrentUserId,
  getUser,
  getUserAnnotations,
  getUsername,
  toggleFollow,
  updateProfile,
  uploadAvatar,
} from '../lib/api.js';

export default function Profile() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState(searchParams.get('tab') || 'annotations');
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [form, setForm] = useState(profileForm(null));
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUser(username)
      .then(async (profile) => {
        const annotations = await getUserAnnotations(profile.id || username, tab);
        if (cancelled) return;
        setUser(profile);
        setForm(profileForm(profile));
        setFollowing(Boolean(profile.following));
        setItems(annotations);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, tab]);

  useEffect(() => {
    setEditing(searchParams.get('edit') === '1');
  }, [searchParams]);

  const isSelf = user && (user.id === getCurrentUserId() || user.username === getUsername());
  const activeTab = isSelf || !['drafts', 'removed'].includes(tab) ? tab : 'annotations';

  async function follow() {
    const next = !following;
    setFollowing(next);
    try {
      const data = await toggleFollow(user.id);
      if (typeof data.following === 'boolean') setFollowing(data.following);
    } catch {
      // Keep optimistic state.
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEditing() {
    setError('');
    setForm(profileForm(user));
    setEditing(true);
    setSearchParams({ edit: '1' });
  }

  function changeTab(nextTab) {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'annotations') nextParams.delete('tab');
    else nextParams.set('tab', nextTab);
    setSearchParams(nextParams);
  }

  function stopEditing() {
    setError('');
    setAvatarFile(null);
    setEditing(false);
    setSearchParams({});
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setError('');

    try {
      let avatarUrl = form.avatar_url.trim();
      if (avatarFile) {
        const upload = await uploadAvatar(avatarFile, user.id);
        avatarUrl = upload.avatar_url || avatarUrl;
      }

      const updated = await updateProfile(user.id, {
        display_name: form.display_name,
        bio: form.bio,
        avatar_url: avatarUrl,
        link: form.link,
        twitter_handle: form.twitter_handle,
      });
      setUser((current) => ({ ...current, ...updated }));
      setForm(profileForm(updated));
      setAvatarFile(null);
      setEditing(false);
      setSearchParams({});
    } catch (err) {
      setError(err.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton-item">
          <div className="skeleton-line short" />
          <div className="skeleton-line headline" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>User not found.</strong>
          <p>This profile does not exist yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="profile-header">
        <div className="profile-identity">
          <UserAvatar user={user} size="md" />
          <div>
            <h1>{user.display_name || user.username}</h1>
            <p>@{user.username}</p>
          </div>
        </div>
        <div className="profile-actions">
          {isSelf ? (
            <button className="button button-outline" onClick={startEditing}>Edit Profile</button>
          ) : (
            <button className="button button-outline" onClick={follow}>{following ? 'Following' : 'Follow'}</button>
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
        <div className="credibility-card">
          <strong>{Number(user.stats?.credibility || user.credibility_score || 0)}</strong>
          <span>Credibility score</span>
        </div>
      </section>

      {editing && isSelf && (
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="form-grid two">
            <label>
              <span>Display name</span>
              <input className="field" required value={form.display_name} onChange={(event) => updateField('display_name', event.target.value)} />
            </label>
            <label>
              <span>Avatar URL</span>
              <input className="field" type="url" value={form.avatar_url} onChange={(event) => updateField('avatar_url', event.target.value)} placeholder="https://..." />
            </label>
          </div>
          <label>
            <span>Upload avatar</span>
            <input className="field" type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
          </label>
          <label>
            <span>Bio</span>
            <textarea className="field profile-bio-field" maxLength="280" value={form.bio} onChange={(event) => updateField('bio', event.target.value)} />
            <small>{form.bio.length}/280</small>
          </label>
          <div className="form-grid two">
            <label>
              <span>Link</span>
              <input className="field" type="url" value={form.link} onChange={(event) => updateField('link', event.target.value)} placeholder="https://example.com" />
            </label>
            <label>
              <span>X handle</span>
              <input className="field" value={form.twitter_handle} onChange={(event) => updateField('twitter_handle', event.target.value.replace(/^@+/, ''))} placeholder="username" />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="button button-solid" type="submit" disabled={saving}>{saving ? 'Saving' : 'Save profile'}</button>
            <button className="button button-text" type="button" onClick={stopEditing}>Cancel</button>
          </div>
        </form>
      )}

      <nav className="text-tabs" aria-label="Profile tabs">
        <button className={activeTab === 'annotations' ? 'active' : ''} onClick={() => changeTab('annotations')}>Annotations</button>
        {isSelf && <button className={activeTab === 'drafts' ? 'active' : ''} onClick={() => changeTab('drafts')}>Drafts</button>}
        {isSelf && <button className={activeTab === 'removed' ? 'active' : ''} onClick={() => changeTab('removed')}>Removed</button>}
        <button className={activeTab === 'liked' ? 'active' : ''} onClick={() => changeTab('liked')}>Liked</button>
      </nav>

      {items.length === 0 ? (
        <div className="empty-state">
          <strong>No {tabLabel(activeTab)} yet.</strong>
          <p>This section is still quiet.</p>
        </div>
      ) : (
        <div className="ruled-list">
          {items.map((annotation) => <AnnotationItem key={annotation.id} annotation={annotation} />)}
        </div>
      )}
    </div>
  );
}

function profileForm(user) {
  return {
    display_name: user?.display_name || user?.username || '',
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

function tabLabel(tab) {
  if (tab === 'drafts') return 'drafts';
  if (tab === 'removed') return 'removed annotations';
  if (tab === 'liked') return 'liked annotations';
  return 'annotations';
}
