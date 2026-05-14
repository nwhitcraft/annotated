import { useNavigate } from 'react-router-dom';

const shortcutTitle = 'One shortcut. Anything.';

const shortcutPlatforms = [
  {
    label: 'Mac',
    modifier: 'option',
    modifierLabel: 'Option',
    shortcut: 'Option + Shift + X',
  },
  {
    label: 'Windows',
    modifier: 'ctrl',
    modifierLabel: 'Ctrl',
    shortcut: 'Ctrl + Shift + X',
  },
];

const lessons = [
  {
    title: 'Text Clipping',
    eyebrow: 'Articles and webpages',
    text: 'Highlight any passage on a webpage. Press Ctrl+Shift+X on Windows, or Option+Shift+X on Mac. The composer opens with your selection ready to annotate.',
  },
  {
    title: 'Video Clipping',
    eyebrow: 'YouTube',
    text: 'Open a YouTube video and press the same shortcut. The recording timer appears, captures up to 90 seconds, and stops when you press Stop.',
  },
  {
    title: 'Podcast Clipping',
    eyebrow: 'Podcast pages',
    text: 'Open a podcast page, press the shortcut, and record the audio moment. Add your commentary, choose a type, then annotate.',
  },
];

export default function OnboardingTutorial() {
  const navigate = useNavigate();

  return (
    <div className="page onboarding-page">
      <header className="editor-heading">
        <p>Step 3</p>
        <h1>How to Clip</h1>
      </header>

      <ol className="step-list">
        <li className="active">Profile</li>
        <li className="active">Extension</li>
        <li className="active">How to clip</li>
      </ol>

      <section className="shortcut-hero" aria-label="Annotated shortcut">
        <div className="shortcut-showcase">
          <header className="shortcut-showcase-header">
            <span>How it works</span>
            <h2 aria-label={shortcutTitle}>
              {Array.from(shortcutTitle).map((char, index) => (
                char === ' ' ? (
                  <span className="shortcut-title-space" aria-hidden="true" key={`space-${index}`} />
                ) : (
                  <span className="shortcut-title-char" aria-hidden="true" key={`${char}-${index}`} style={{ '--char-index': index }}>
                    {char}
                  </span>
                )
              ))}
            </h2>
            <p>Highlight a sentence, listen to a podcast, or watch a clip. Press the keys and it is ready to annotate.</p>
          </header>

          <div className="shortcut-platform-grid" aria-label="Keyboard shortcuts">
            {shortcutPlatforms.map((platform) => (
              <article className="shortcut-platform" key={platform.label}>
                <h3>{platform.label}</h3>
                <ShortcutKeyboard platform={platform} />
                <p>{platform.shortcut}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="tutorial-grid">
        {lessons.map((lesson) => (
          <section className="tutorial-section" key={lesson.title}>
            <div>
              <span>{lesson.eyebrow}</span>
              <h2>{lesson.title}</h2>
              <p>{lesson.text}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="form-actions">
        <button className="button button-solid" type="button" onClick={() => navigate('/feed')}>
          Done
        </button>
      </div>
    </div>
  );
}

function ShortcutKeyboard({ platform }) {
  return (
    <div className="shortcut-keyboard" aria-hidden="true">
      <ShortcutKey type="shift" label="Shift" />
      <ShortcutKey isBlank />
      <ShortcutKey type="x" label="X" />
      <ShortcutKey isBlank />
      <ShortcutKey type={platform.modifier} label={platform.modifierLabel} />
      <ShortcutKey isBlank />
    </div>
  );
}

function ShortcutKey({ type, label, isBlank = false }) {
  if (isBlank) {
    return <span className="shortcut-key shortcut-key-blank" />;
  }

  return (
    <span className={`shortcut-key shortcut-key-${type} shortcut-key-active`}>
      {type === 'shift' && <ShiftGlyph />}
      {type === 'option' && <OptionGlyph />}
      <span>{label}</span>
    </span>
  );
}

function ShiftGlyph() {
  return (
    <svg className="shortcut-key-symbol" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4 L20 12 L16 12 L16 19 L8 19 L8 12 L4 12 Z" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function OptionGlyph() {
  return (
    <svg className="shortcut-key-symbol" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6 L9 6 L15 18 L21 18 M14 6 L21 6" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
