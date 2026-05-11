import { Link } from 'react-router-dom';

export default function OnboardingTutorial() {
  return (
    <div className="page onboarding-page">
      <header className="editor-heading">
        <p>First clip tutorial</p>
        <h1>Clip the source, then make the argument.</h1>
      </header>
      <div className="ruled-list">
        {[
          'Open an article, YouTube video, podcast page, or X post.',
          'Press Command+Shift+X to start clipping.',
          'Select the passage or capture the current media timestamp.',
          'Finish the annotation in the side panel.',
          'Publish and check the feed.',
        ].map((item, index) => (
          <article className="annotation-item" key={item}>
            <p className="annotation-eyebrow">Step {index + 1}</p>
            <h2 className="annotation-headline">{item}</h2>
          </article>
        ))}
      </div>
      <Link className="button button-solid" to="/new">Try with a URL</Link>
    </div>
  );
}
