import { useState } from 'react';

export default function AccessibilityPrompt({ visible, onOpenSettings, onDismiss, onDontShowAgain }) {
  const [dontShow, setDontShow] = useState(false);

  if (!visible) return null;

  return (
    <div className="accessibility-prompt-overlay" role="presentation">
      <section className="accessibility-prompt-card" aria-label="Accessibility permission required">
        <header className="accessibility-prompt-header">
          <h2>Enable Text Capture</h2>
        </header>

        <p className="accessibility-prompt-desc">
          Annotated needs <strong>Accessibility permission</strong> to capture highlighted text from
          other apps. Without it, the <kbd>⌥⇧X</kbd> shortcut can only start screen recordings.
        </p>

        <div className="accessibility-prompt-steps">
          <p><strong>How to enable:</strong></p>
          <ol>
            <li>Open <strong>System Settings → Privacy &amp; Security → Accessibility</strong></li>
            <li>Find <em>Annotated</em> in the list and toggle it on</li>
            <li>If Annotated isn't listed, click the <strong>+</strong> button to add it</li>
          </ol>
        </div>

        <footer className="accessibility-prompt-actions">
          <button
            className="accessibility-prompt-primary"
            type="button"
            onClick={onOpenSettings}
          >
            Open System Settings
          </button>
          <button
            className="accessibility-prompt-secondary"
            type="button"
            onClick={() => {
              if (dontShow) {
                onDontShowAgain?.();
              } else {
                onDismiss?.();
              }
            }}
          >
            Not Now
          </button>
        </footer>

        <label className="accessibility-prompt-remember">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
          />
          Don't show this again
        </label>
      </section>
    </div>
  );
}
