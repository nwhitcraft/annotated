import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NewAnnotation() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [clipText, setClipText] = useState('');
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(90);
  const [commentary, setCommentary] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  async function detectSource() {
    if (!url.trim()) return;
    setDetecting(true);
    setError('');
    try {
      const res = await fetch('/api/clip/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setDetected(data);

      // Auto-extract article metadata
      if (data.type === 'article') {
        const metaRes = await fetch('/api/clip/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });
        const meta = await metaRes.json();
        setDetected(prev => ({ ...prev, ...meta }));
      }
    } catch {
      setError('Could not detect source type');
    }
    setDetecting(false);
  }

  async function submit() {
    if (!commentary.trim()) { setError('Add your take first'); return; }
    setPosting(true);
    setError('');

    try {
      // For video/audio, create the clip first
      let clipMediaPath = null;
      if (detected?.type === 'youtube') {
        const clipRes = await fetch('/api/clip/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), start: clipStart, end: clipEnd }),
        });
        const clipData = await clipRes.json();
        if (clipData.error) { setError(clipData.error); setPosting(false); return; }
        clipMediaPath = clipData.mediaPath;
      } else if (detected?.type === 'podcast') {
        const clipRes = await fetch('/api/clip/podcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), start: clipStart, end: clipEnd }),
        });
        const clipData = await clipRes.json();
        if (clipData.error) { setError(clipData.error); setPosting(false); return; }
        clipMediaPath = clipData.mediaPath;
      }

      // Create the annotation
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'demo-user', // TODO: replace with auth
          source_url: url.trim(),
          source_title: detected?.title || '',
          source_type: detected?.type || 'article',
          source_domain: detected?.domain || '',
          source_thumbnail: detected?.thumbnail || '',
          clip_text: detected?.type === 'article' ? clipText : null,
          clip_start_sec: ['youtube', 'podcast'].includes(detected?.type) ? clipStart : null,
          clip_end_sec: ['youtube', 'podcast'].includes(detected?.type) ? clipEnd : null,
          clip_media_path: clipMediaPath,
          commentary: commentary.trim(),
        }),
      });
      const data = await res.json();
      if (data.id) navigate(`/a/${data.id}`);
      else setError('Failed to post');
    } catch (err) {
      setError('Something went wrong');
    }
    setPosting(false);
  }

  const typeLabels = { article: '📰 Article', youtube: '▶ YouTube Video', podcast: '🎙 Podcast' };

  return (
    <div className="container" style={{ maxWidth: 580 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ color: 'var(--accent)' }}>✦</span> New Annotation
        </h1>
        <p className="text-secondary" style={{ fontSize: 14, marginTop: 4 }}>
          Paste a URL, clip the moment, add your take.
        </p>
      </div>

      {/* Step 1: URL */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 8, display: 'block' }}>
          Source URL
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && detectSource()}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={detectSource}
            disabled={detecting || !url.trim()}
            style={{ opacity: detecting ? 0.6 : 1 }}
          >
            {detecting ? '...' : 'Detect'}
          </button>
        </div>
      </div>

      {/* Step 2: Clip */}
      {detected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span className={`badge badge-${detected.type}`}>
              {typeLabels[detected.type] || detected.type}
            </span>
            {detected.title && (
              <span className="truncate text-secondary" style={{ fontSize: 13 }}>{detected.title}</span>
            )}
          </div>

          {detected.type === 'article' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 8, display: 'block' }}>
                Highlight the key passage
              </label>
              <textarea
                placeholder="Paste or type the text you want to highlight..."
                value={clipText}
                onChange={e => setClipText(e.target.value)}
                className="input"
                style={{ minHeight: 80 }}
              />
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 12, display: 'block' }}>
                Clip range (max 90 seconds)
              </label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Start</div>
                  <input
                    type="number"
                    min="0"
                    value={clipStart}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setClipStart(v);
                      if (clipEnd - v > 90) setClipEnd(v + 90);
                    }}
                    className="input"
                    style={{ textAlign: 'center' }}
                  />
                  <div className="text-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                    {formatTime(clipStart)}
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)', paddingTop: 14 }}>→</div>
                <div style={{ flex: 1 }}>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>End</div>
                  <input
                    type="number"
                    min="0"
                    value={clipEnd}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setClipEnd(Math.min(v, clipStart + 90));
                    }}
                    className="input"
                    style={{ textAlign: 'center' }}
                  />
                  <div className="text-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                    {formatTime(clipEnd)}
                  </div>
                </div>
                <div style={{ paddingTop: 14, fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                  {clipEnd - clipStart}s
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Commentary */}
      {detected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 8, display: 'block' }}>
            Your take
          </label>
          <textarea
            placeholder="What's your commentary on this? Why does it matter?"
            value={commentary}
            onChange={e => setCommentary(e.target.value)}
            className="input font-serif"
            style={{ minHeight: 100, fontSize: 15, lineHeight: 1.7 }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Submit */}
      {detected && commentary.trim() && (
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={posting}
          style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 600, opacity: posting ? 0.6 : 1 }}
        >
          {posting ? 'Posting...' : '✦ Post Annotation'}
        </button>
      )}
    </div>
  );
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
