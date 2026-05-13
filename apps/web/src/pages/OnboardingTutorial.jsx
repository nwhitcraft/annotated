import { useNavigate } from 'react-router-dom';

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
        <div className="shortcut-artifact">
          <div className="shortcut-artifact-copy">
            <span>Universal clipping shortcut</span>
            <h2>Open the composer from any article, video or podcast.</h2>
          </div>
          <div className="shortcut-key-row" aria-hidden="true">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Shift</kbd>
            <span>+</span>
            <kbd>X</kbd>
          </div>
          <p>Mac: Option + Shift + X</p>
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
