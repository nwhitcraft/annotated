import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import AnnotationCard from '../components/AnnotationCard.jsx';

export default function AnnotationPage() {
  const { id } = useParams();
  const [annotation, setAnnotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimEmail, setClaimEmail] = useState('');
  const [claimReason, setClaimReason] = useState('');
  const [claimSent, setClaimSent] = useState(false);

  useEffect(() => {
    fetch(`/api/annotations/${id}`)
      .then(r => r.json())
      .then(data => { setAnnotation(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function fileClaim(e) {
    e.preventDefault();
    try {
      await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annotation_id: id,
          claimant_email: claimEmail,
          reason: claimReason,
        }),
      });
      setClaimSent(true);
    } catch {}
  }

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 680 }}>
        <div className="card" style={{ height: 300 }}>
          <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 80, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 14, width: '40%' }} />
        </div>
      </div>
    );
  }

  if (!annotation || annotation.error) {
    return (
      <div className="container" style={{ maxWidth: 680, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
        <h2>Annotation not found</h2>
        <p className="text-secondary" style={{ marginTop: 8 }}>It may have been removed or doesn't exist.</p>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: 24 }}>Back to feed</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <Link to="/" className="btn-ghost text-secondary" style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        ← Back to feed
      </Link>

      <AnnotationCard annotation={annotation} />

      {/* Comments */}
      {annotation.comments?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            Comments ({annotation.comments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {annotation.comments.map(c => (
              <div key={c.id} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className="avatar avatar-sm avatar-placeholder">
                    {(c.display_name || c.username || '?')[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.display_name || c.username}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File a Claim */}
      <div className="divider" />
      
      <div style={{ textAlign: 'center', paddingBottom: 48 }}>
        {!claimOpen ? (
          <button
            className="btn btn-secondary btn-sm btn-danger"
            onClick={() => setClaimOpen(true)}
            style={{ fontSize: 12 }}
          >
            ⚖️ File a claim
          </button>
        ) : claimSent ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <h4>Claim filed</h4>
            <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
              We'll review your claim and respond via email.
            </p>
          </div>
        ) : (
          <form onSubmit={fileClaim} className="card" style={{ textAlign: 'left' }}>
            <h4 style={{ marginBottom: 4 }}>⚖️ File a Fair Use Claim</h4>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 16 }}>
              If you believe this annotation violates your copyright, submit a claim below.
            </p>
            <input
              type="email"
              placeholder="Your email address"
              required
              value={claimEmail}
              onChange={e => setClaimEmail(e.target.value)}
              className="input"
              style={{ marginBottom: 12 }}
            />
            <textarea
              placeholder="Describe your claim..."
              required
              value={claimReason}
              onChange={e => setClaimReason(e.target.value)}
              className="input"
              style={{ marginBottom: 12, minHeight: 80 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm">Submit claim</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setClaimOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
