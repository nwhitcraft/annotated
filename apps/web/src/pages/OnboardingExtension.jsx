import { useNavigate } from 'react-router-dom';

const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/annotated';

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
        <a className="button button-solid onboarding-store-button" href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
          Download from Chrome Web Store
        </a>
        <div className="onboarding-instructions">
          <p>After installing, click the extension icon in your toolbar.</p>
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
