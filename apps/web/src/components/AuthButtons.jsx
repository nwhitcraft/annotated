import { authUrl } from '../lib/api.js';

const providers = [
  { key: 'google', label: 'Continue with Google', mark: 'G' },
  { key: 'twitter', label: 'Continue with X', mark: 'X' },
];

export default function AuthButtons({ compact = false }) {
  function go(provider) {
    window.location.href = authUrl(provider);
  }

  return (
    <div className={`auth-button-group ${compact ? 'auth-button-group-compact' : ''}`}>
      {providers.map((provider) => (
        <button key={provider.key} className="oauth-button" onClick={() => go(provider.key)}>
          <span className="oauth-mark" aria-hidden="true">{provider.mark}</span>
          <span>{provider.label}</span>
        </button>
      ))}
    </div>
  );
}
