import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const REASON_LABELS = {
  copyright: 'Copyright infringement',
  misrepresentation: 'Misrepresentation',
  defamation: 'Defamation',
  privacy: 'Privacy violation',
  harassment: 'Harassment',
  other: 'Other',
};

export default function AdminClaims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchClaims();
  }, [filter]);

  async function fetchClaims() {
    setLoading(true);
    try {
      const res = await fetch(`/api/claims?status=${filter}`);
      const data = await res.json();
      setClaims(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatus(claimId, newStatus) {
    try {
      await fetch(`/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchClaims();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleBlockUser(userId) {
    if (!confirm('Block this user? They will be unable to create new annotations.')) return;
    try {
      await fetch('/api/claims/block-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, reason: 'Claim review' }),
      });
      fetchClaims();
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <div className="page"><p>Loading claims...</p></div>;
  if (error) return <div className="page"><p>Error: {error}</p></div>;

  return (
    <div className="page">
      <Link to="/feed" className="back-link">← Feed</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, margin: '24px 0' }}>
        Claim Review
      </h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['pending', 'reviewed', 'resolved', 'annotation_removed', 'user_blocked'].map((s) => (
          <button
            key={s}
            className={`button ${filter === s ? 'button-solid' : 'button-outline'}`}
            onClick={() => setFilter(s)}
            style={{ textTransform: 'capitalize', fontSize: '12px', padding: '6px 12px' }}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {claims.length === 0 ? (
        <p className="feed-empty">No {filter} claims.</p>
      ) : (
        <div className="ruled-list">
          {claims.map((claim) => (
            <div key={claim.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '14px' }}>{claim.display_name || claim.username || 'Unknown'}</strong>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginLeft: '8px' }}>
                    @{claim.username}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  textTransform: 'capitalize',
                }}>
                  {claim.status.replace('_', ' ')}
                </span>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Annotation:</strong>
                <p style={{ margin: '4px 0', fontFamily: 'var(--font-serif)', fontSize: '16px' }}>
                  {claim.commentary}
                </p>
                <a href={claim.source_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--accent)' }}>
                  {claim.source_title || claim.source_url}
                </a>
              </div>

              <div style={{ marginBottom: '8px', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Claim:</strong>
                <p style={{ margin: '4px 0', fontSize: '13px' }}>
                  <strong>Reason:</strong> {REASON_LABELS[claim.reason_code] || claim.reason_code}
                </p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}>
                  <strong>Claimant:</strong> {claim.claimant_email}
                </p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}>
                  <strong>Description:</strong> {claim.description}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {filter === 'pending' && (
                  <>
                    <button
                      className="button button-solid"
                      onClick={() => handleStatus(claim.id, 'resolved')}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Resolve (keep annotation)
                    </button>
                    <button
                      className="button button-outline"
                      onClick={() => handleStatus(claim.id, 'annotation_removed')}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Remove annotation
                    </button>
                    <button
                      className="button button-outline"
                      onClick={() => handleBlockUser(claim.user_id)}
                      style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--danger)' }}
                    >
                      Block user
                    </button>
                  </>
                )}
                {filter !== 'pending' && (
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Filed {new Date(claim.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
