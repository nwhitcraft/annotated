import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checkAuth,
  checkUsername,
  getAvatarUrl,
  getDisplayName,
  getUsername,
  onboardUser,
  uploadAvatar,
} from '../lib/api.js';

export default function Onboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState(getDisplayName() || getUsername() || '');
  const [age, setAge] = useState('');
  const [username, setUsername] = useState(getUsername() || '');
  const [avatarUrl, setAvatarUrl] = useState(getAvatarUrl() || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(getAvatarUrl() || '');
  const [usernameState, setUsernameState] = useState({ checking: false, available: false, message: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ageValid = useMemo(() => {
    if (age === '') return false;
    const value = Number(age);
    return Number.isInteger(value) && value >= 13 && value <= 120;
  }, [age]);

  useEffect(() => {
    let cancelled = false;
    checkAuth().then((result) => {
      if (cancelled || result.error) return;
      setUser(result.user);
      setDisplayName(result.user.display_name || result.user.username || '');
      setUsername(result.user.username || '');
      setAge(result.user.age || '');
      setAvatarUrl(result.user.avatar_url || '');
      setAvatarPreview(result.user.avatar_url || '');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!avatarFile) return undefined;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    const value = username.trim().toLowerCase();
    if (!value) {
      setUsernameState({ checking: false, available: false, message: 'Choose a username.' });
      return undefined;
    }

    if (user?.username && value === user.username) {
      setUsernameState({ checking: false, available: true, message: 'Available' });
      return undefined;
    }

    setUsernameState({ checking: true, available: false, message: 'Checking...' });
    const timer = window.setTimeout(() => {
      checkUsername(value)
        .then((result) => {
          setUsernameState({
            checking: false,
            available: Boolean(result.available),
            message: result.available ? 'Available' : `Taken - try ${result.suggestion || `${value}_1`}`,
          });
        })
        .catch(() => {
          setUsernameState({ checking: false, available: false, message: 'Could not check username.' });
        });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [username, user?.username]);

  async function submit(event) {
    event.preventDefault();
    if (!displayName.trim() || !usernameState.available || !ageValid || saving) return;
    setSaving(true);
    setError('');

    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        const upload = await uploadAvatar(avatarFile, user?.id);
        finalAvatarUrl = upload.avatar_url || finalAvatarUrl;
      }

      await onboardUser({
        display_name: displayName.trim(),
        age: age === '' ? null : Number(age),
        avatar_url: finalAvatarUrl || null,
        username: username.trim().toLowerCase(),
      });
      navigate('/onboarding/extension', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not complete onboarding');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = displayName.trim() && usernameState.available && ageValid && !saving;

  return (
    <div className="page onboarding-page">
      <header className="editor-heading">
        <p>Welcome to Annotated</p>
        <h1>Set up the profile people will see beside your annotations.</h1>
      </header>

      <ol className="step-list">
        {['Profile', 'Extension', 'How to clip'].map((label, index) => (
          <li key={label} className={index === 0 ? 'active' : ''}>{label}</li>
        ))}
      </ol>

      <form className="editor-form onboarding-form" onSubmit={submit}>
        <section className="form-section">
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            className="field"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Nick Whitcraft"
          />

          <label htmlFor="age">Age</label>
          <input
            id="age"
            className="field"
            type="number"
            min="13"
            max="120"
            required
            value={age}
            onChange={(event) => setAge(event.target.value)}
            placeholder="13-120"
          />
          {!ageValid && <p className="form-error">Age must be between 13 and 120.</p>}

          <label htmlFor="avatar">Profile picture</label>
          <div className="avatar-upload-row">
            <span className="avatar-preview">
              {avatarPreview ? <img src={avatarPreview} alt="" /> : initials(displayName || username)}
            </span>
            <input
              id="avatar"
              className="field"
              type="file"
              accept="image/*"
              onChange={(event) => setAvatarFile(event.target.files?.[0] || null)}
            />
          </div>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="field mono-field"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="nick"
            autoComplete="off"
          />
          <p className={`username-check ${usernameState.available ? 'available' : 'taken'}`}>
            {usernameState.checking ? 'Checking...' : usernameState.available ? '✓ Available' : `✗ ${usernameState.message}`}
          </p>
        </section>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button className="button button-solid" type="submit" disabled={!canSubmit}>
            {saving ? 'Submitting' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

function initials(value) {
  return String(value || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}
