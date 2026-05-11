import { useEffect, useMemo, useState } from 'react';
import { detectSource, parseTags } from '../lib/detect.js';
import SourceType from './SourceType.jsx';

const emptyDraft = {
  source_url: '',
  source_type: 'article',
  source_title: '',
  source_domain: '',
  source_thumbnail: '',
  clip_text: '',
  clip_start_sec: '',
  clip_end_sec: '',
  commentary: '',
  tags: [],
  is_public: 0,
};

export default function Composer({ editing, onSave, onPost }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    setDraft(editing || emptyDraft);
    setTagText((editing?.tags || []).join(', '));
  }, [editing]);

  const detected = useMemo(() => detectSource(draft.source_url), [draft.source_url]);

  function applyDetection() {
    if (!detected) return;
    setDraft((value) => ({ ...value, ...detected }));
  }

  async function save(isPublic) {
    const payload = {
      ...draft,
      tags: parseTags(tagText),
      is_public: isPublic ? 1 : Number(draft.is_public || 0),
      clip_start_sec: draft.clip_start_sec === '' ? null : Number(draft.clip_start_sec),
      clip_end_sec: draft.clip_end_sec === '' ? null : Number(draft.clip_end_sec),
    };
    const saved = await onSave(payload);
    if (isPublic) await onPost(saved.id);
    if (!editing) {
      setDraft(emptyDraft);
      setTagText('');
    }
  }

  return (
    <section className="composer-panel" aria-label="Annotation composer">
      <header className="composer-toolbar">
        <div>
          <p>Annotation Composer</p>
          <h1>Clip now. Publish when the sentence is ready.</h1>
        </div>
        <kbd>⌘⇧A</kbd>
      </header>

      <label>
        URL
        <div className="detect-row">
          <input value={draft.source_url} onChange={(event) => setDraft({ ...draft, source_url: event.target.value })} placeholder="https://" />
          <button className="button button-outline" onClick={applyDetection} disabled={!detected}>Detect</button>
        </div>
      </label>

      {draft.source_domain && (
        <p className="detected-source">
          <SourceType type={draft.source_type} />
          <strong>{draft.source_title}</strong>
          <span>{draft.source_domain}</span>
        </p>
      )}

      <label>
        Clip text
        <textarea className="quote-input" value={draft.clip_text || ''} onChange={(event) => setDraft({ ...draft, clip_text: event.target.value })} placeholder="Paste the passage you want to annotate..." />
      </label>

      {draft.source_type !== 'article' && (
        <div className="time-fields">
          <label>
            Start
            <input type="number" min="0" value={draft.clip_start_sec ?? ''} onChange={(event) => setDraft({ ...draft, clip_start_sec: event.target.value })} />
          </label>
          <label>
            End
            <input type="number" min="0" value={draft.clip_end_sec ?? ''} onChange={(event) => setDraft({ ...draft, clip_end_sec: event.target.value })} />
          </label>
        </div>
      )}

      <label>
        Commentary
        <textarea className="commentary-input" value={draft.commentary} onChange={(event) => setDraft({ ...draft, commentary: event.target.value })} placeholder="Write the argument..." />
      </label>

      <label>
        Tags
        <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="economy, ai, research" />
      </label>

      <footer className="composer-actions">
        <button className="button button-outline" onClick={() => save(false)} disabled={!draft.source_url || !draft.commentary}>Save locally</button>
        <button className="button button-solid" onClick={() => save(true)} disabled={!draft.source_url || !draft.commentary}>Post to feed</button>
      </footer>
    </section>
  );
}
