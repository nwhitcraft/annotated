import { useNavigate } from 'react-router-dom';

export default function OnboardingExtension() {
  const navigate = useNavigate();

  return (
    <div className="page onboarding-page">
      <header className="editor-heading">
        <p>Step 2</p>
        <h1>Install the Chrome Extension</h1>
      </header>

      <ol className="step-list">
        <li className="active">Profile</li>
        <li className="active">Extension</li>
        <li>How to clip</li>
      </ol>

      <section className="onboarding-panel">
        <div className="extension-install-card">
          <strong>Use the development extension for launch testing</strong>
          <p>The Chrome Web Store listing is coming soon. For Thursday night, load the unpacked extension from the local project.</p>
          <code>/Users/nicholaswhitcraft/Documents/New project/annotated/apps/extension</code>
        </div>
        <div className="onboarding-instructions">
          <p>Open chrome://extensions, enable Developer Mode, then choose Load unpacked.</p>
          <p>Select the extension folder above, then click the extension icon in your toolbar.</p>
          <p>Click Sign in in the side panel to connect your account.</p>
          <p>Your personal feed will appear once you're logged in.</p>
        </div>
      </section>

      <div className="form-actions">
        <button className="button button-solid" type="button" onClick={() => navigate('/onboarding/tutorial')}>
          Continue
        </button>
      </div>
    </div>
  );
}
