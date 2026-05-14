import { useNavigate } from 'react-router-dom';

const extensionDownloadUrl = '/downloads/annotated-chrome-extension.zip';

const installSteps = [
  {
    title: 'Open Chrome extensions',
    body: 'In Chrome, type chrome://extensions into the address bar and press Enter.',
    visual: 'extensions',
  },
  {
    title: 'Turn on Developer Mode',
    body: 'Use the Developer Mode switch in the top-right corner. It must be on before Chrome will show Load unpacked.',
    visual: 'developer',
  },
  {
    title: 'Load the Annotated folder',
    body: 'Click Load unpacked, choose the extension folder, then press Select. Do not choose the repo root.',
    visual: 'folder',
  },
  {
    title: 'Open and close the sidebar',
    body: 'Click the Annotated extension icon, open the side panel, then sign in. Close it with the X at the top of the Chrome side panel.',
    visual: 'sidepanel',
  },
];

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
          <strong>Install the launch-test extension</strong>
          <p>The Chrome Web Store listing is coming soon. For now, install the development version by loading the extension folder manually.</p>
          {extensionDownloadUrl ? (
            <a className="button button-solid" href={extensionDownloadUrl} target="_blank" rel="noreferrer">Download Chrome extension</a>
          ) : (
            <button className="button button-solid" type="button" disabled>Download Chrome extension</button>
          )}
        </div>

        <div className="extension-step-grid">
          {installSteps.map((step, index) => (
            <article className="extension-step" key={step.title}>
              <ExtensionVisual type={step.visual} />
              <div>
                <span>Step {index + 1}</span>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>

        <section className="onboarding-instructions" aria-label="Extension checks">
          <p>After loading, make sure Annotated appears in Chrome's extensions list and is switched on.</p>
          <p>Pin the extension if you want it visible in the toolbar. If the side panel is hidden, click the extension icon again.</p>
          <p>Once signed in, the side panel will show your feed for the current page.</p>
        </section>
      </section>

      <div className="form-actions">
        <button className="button button-solid" type="button" onClick={() => navigate('/onboarding/tutorial')}>
          Continue
        </button>
      </div>
    </div>
  );
}

function ExtensionVisual({ type }) {
  if (type === 'extensions') {
    return (
      <div className="extension-visual">
        <div className="browser-bar">chrome://extensions</div>
        <div className="extension-browser-body">
          <strong>Extensions</strong>
          <span>Manage your Chrome extensions</span>
        </div>
      </div>
    );
  }

  if (type === 'developer') {
    return (
      <div className="extension-visual">
        <div className="developer-toggle">
          <span>Developer Mode</span>
          <strong>On</strong>
        </div>
        <div className="load-unpacked-button">Load unpacked</div>
      </div>
    );
  }

  if (type === 'folder') {
    return (
      <div className="extension-visual">
        <div className="folder-window">
          <span>annotated</span>
          <strong>apps / extension</strong>
          <em>Select</em>
        </div>
      </div>
    );
  }

  return (
    <div className="extension-visual extension-sidepanel-visual">
      <div className="extension-page-lines">
        <span />
        <span />
        <span />
      </div>
      <aside>
        <strong>annotated</strong>
        <span>Sign in</span>
        <em>X</em>
      </aside>
    </div>
  );
}
