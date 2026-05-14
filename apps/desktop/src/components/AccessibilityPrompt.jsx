import { useState } from 'react';

export default function AccessibilityPrompt({ visible, onOpenSettings, onDismiss }) {
  const [opening, setOpening] = useState(false);

  if (!visible) return null;

  async function openSettings() {
    setOpening(true);
    try {
      await onOpenSettings?.();
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="accessibility-prompt-overlay" role="presentation">
      <section className="accessibility-prompt-card" aria-label="Accessibility permission required">
        <header>
          <p>Mac permission required</p>
          <h2>Enable global text clipping</h2>
        </header>
        <p>
          Annotated needs Accessibility permission to read highlighted text in other apps.
          Without it, the desktop shortcut cannot safely tell text clips apart from screen clips.
        </p>
        <ol>
          <li>Open System Settings.</li>
          <li>Go to Privacy &amp; Security, then Accessibility.</li>
          <li>Turn on Annotated, then try <kbd>⌥⇧X</kbd> again.</li>
        </ol>
        <footer>
          <button className="button button-solid" type="button" onClick={openSettings} disabled={opening}>
            {opening ? 'Opening' : 'Open Settings'}
          </button>
          <button className="button button-outline" type="button" onClick={onDismiss}>
            Not Now
          </button>
        </footer>
      </section>
    </div>
  );
}
