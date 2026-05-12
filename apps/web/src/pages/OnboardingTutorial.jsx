import { useNavigate } from 'react-router-dom';

const lessons = [
  {
    title: 'Text Clipping',
    text: 'Highlight any passage on a webpage. Press Ctrl+Shift+X (Mac: Option+Shift+X). The composer opens with your selection. Add commentary, choose a type, and post.',
  },
  {
    title: 'Video Clipping',
    text: "Go to any YouTube video. Press Ctrl+Shift+X (Mac: Option+Shift+X). A recording bubble appears - the extension captures up to 90 seconds of video and audio. Click Stop when you're done. Add your commentary and post.",
  },
  {
    title: 'Podcast Clipping',
    text: 'Open a podcast page. Press Ctrl+Shift+X (Mac: Option+Shift+X). The extension records up to 90 seconds of audio. Click Stop. Add your commentary and post.',
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

      <div className="tutorial-grid">
        {lessons.map((lesson) => (
          <section className="tutorial-section" key={lesson.title}>
            <img src="/shortcut-keys.png" alt="" />
            <div>
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
