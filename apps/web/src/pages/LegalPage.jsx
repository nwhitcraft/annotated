import { Link } from 'react-router-dom';

const UPDATED_AT = 'May 14, 2026';

const privacySections = [
  {
    title: 'Information we collect',
    body: [
      'When you sign in, Annotated receives the basic account information provided by your OAuth provider, such as your name, username or email address, profile image, and provider account identifier.',
      'When you use the product, we store the annotations, comments, source links, selected quotes, timestamps, media clip metadata, profile details, and moderation reports that you submit.',
      'We may also collect ordinary technical information, such as browser, device, log, and usage information, to keep the service secure and working.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'We use information to provide sign-in, publish and display annotations, connect comments to sources, operate the feed, maintain your profile, respond to reports, prevent abuse, and improve the product.',
      'Some information you publish, including your profile, annotations, comments, source references, and public activity, may be visible to other users and visitors.',
    ],
  },
  {
    title: 'Sharing',
    body: [
      'We do not sell personal information. We share information with service providers only as needed to operate Annotated, such as hosting, authentication, storage, analytics, email, and security providers.',
      'We may disclose information if required by law, to protect rights and safety, to investigate abuse, or as part of a business transfer.',
    ],
  },
  {
    title: 'Retention and control',
    body: [
      'We keep account and content information for as long as needed to provide the service, comply with legal obligations, resolve disputes, enforce terms, and preserve moderation history.',
      'You may request account or content deletion by contacting us. Some removed content may remain in backups, logs, report records, or places where others have already seen or interacted with it.',
    ],
  },
  {
    title: 'Children and changes',
    body: [
      'Annotated is not intended for children under 13. We may update this policy as the product changes, and the latest version will be posted here.',
    ],
  },
];

const termsSections = [
  {
    title: 'Using Annotated',
    body: [
      'Annotated lets users clip sources, write commentary, discuss context, and publish annotations. You are responsible for your account, your activity, and the content you submit.',
      'You agree not to misuse the service, interfere with its operation, attempt unauthorized access, scrape or harvest data without permission, impersonate others, or use Annotated to violate law or rights.',
    ],
  },
  {
    title: 'Your content',
    body: [
      'You keep ownership of content you submit. By posting content to Annotated, you give us a worldwide, non-exclusive license to host, store, reproduce, display, distribute, and adapt that content as needed to operate and improve the service.',
      'You are responsible for making sure you have the rights needed for the quotes, clips, commentary, links, images, and other materials you submit.',
    ],
  },
  {
    title: 'Public discussion and moderation',
    body: [
      'Annotations, comments, profiles, and related activity may be public. We may remove content, limit distribution, suspend accounts, or take other moderation action when we believe it is necessary to protect people, sources, rights, or the service.',
      'Annotated may provide report and review tools, but we are not responsible for resolving every dispute between users, publishers, creators, or third parties.',
    ],
  },
  {
    title: 'Third-party services',
    body: [
      'Annotated may connect to third-party services such as Google, X, browsers, media platforms, hosting providers, and email providers. Their own terms and policies apply to their services.',
    ],
  },
  {
    title: 'Disclaimers',
    body: [
      'Annotated is provided as is and as available. We do not promise that the service will be uninterrupted, error-free, or suitable for every purpose.',
      'To the fullest extent allowed by law, Annotated and its operators are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, goodwill, or content.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may change these terms as the product evolves. Continued use of Annotated after changes are posted means you accept the updated terms.',
    ],
  },
];

export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what Annotated collects, how it is used, and what is public when you clip, comment, and publish annotations."
      sections={privacySections}
    />
  );
}

export function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms describe the rules for using Annotated and publishing source-linked commentary through the service."
      sections={termsSections}
    />
  );
}

function LegalPage({ title, intro, sections }) {
  return (
    <article className="legal-page">
      <div className="legal-kicker">Annotated</div>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {UPDATED_AT}</p>
      <p className="legal-intro">{intro}</p>

      {sections.map((section) => (
        <section className="legal-section" key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}

      <section className="legal-section">
        <h2>Contact</h2>
        <p>Questions about these terms or this privacy policy can be sent through the Annotated support or admin contact channels provided in the product.</p>
      </section>

      <footer className="legal-footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/">Back to Annotated</Link>
      </footer>
    </article>
  );
}
