import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSuggestedUsers, getUsername, toggleFollow } from '../lib/api.js';

const interests = ['Politics', 'Tech', 'Media', 'Science', 'Markets', 'Culture'];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(getUsername() || '');
  const [selected, setSelected] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [followed, setFollowed] = useState(new Set());

  useEffect(() => {
    getSuggestedUsers().then(setSuggested).catch(() => setSuggested([]));
  }, []);

  async function follow(id) {
    const next = new Set(followed);
    next.has(id) ? next.delete(id) : next.add(id);
    setFollowed(next);
    try {
      await toggleFollow(id);
    } catch {
      // Keep onboarding moving; the user can retry follows later.
    }
  }

  return (
    <div className="page onboarding-page">
      <header className="editor-heading">
        <p>Welcome to Annotated</p>
        <h1>Set up your clipping desk.</h1>
      </header>

      <ol className="step-list">
        {['Username', 'Interests', 'Follow', 'Extension', 'First clip'].map((label, index) => (
          <li key={label} className={index <= step ? 'active' : ''}>{label}</li>
        ))}
      </ol>

      {step === 0 && (
        <section className="form-section">
          <label htmlFor="username">Username</label>
          <input id="username" className="field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="nick" />
        </section>
      )}

      {step === 1 && (
        <section className="tag-picker" aria-label="Choose interests">
          {interests.map((item) => (
            <button key={item} className={selected.includes(item) ? 'active' : ''} onClick={() => setSelected((value) => value.includes(item) ? value.filter((x) => x !== item) : [...value, item])}>
              {item}
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="suggested-list">
          {suggested.map((user) => (
            <button key={user.id} className={followed.has(user.id) ? 'active' : ''} onClick={() => follow(user.id)}>
              <span>{user.display_name || user.username}</span>
              <small>@{user.username}</small>
            </button>
          ))}
        </section>
      )}

      {step === 3 && (
        <section className="empty-state">
          <strong>Install the Chrome extension.</strong>
          <p>Open the extension side panel, sign in, then use Command+Shift+X to clip a source.</p>
        </section>
      )}

      {step === 4 && (
        <section className="empty-state">
          <strong>Make the first clip.</strong>
          <p>Highlight a passage, open the side panel, choose a tag, and publish your annotation.</p>
          <Link className="button button-solid" to="/new">Start with a URL</Link>
        </section>
      )}

      <div className="form-actions">
        <button className="button button-outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>
        <button className="button button-solid" onClick={() => setStep((value) => Math.min(4, value + 1))}>{step === 4 ? 'Done' : 'Next'}</button>
      </div>
    </div>
  );
}
