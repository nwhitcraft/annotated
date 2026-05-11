import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteClaim, getClaims, updateClaim } from '../lib/api.js';

const statuses = ['pending', 'reviewed', 'resolved'];

export default function AdminClaims() {
  const [status, setStatus] = useState('pending');
  const [claims, setClaims] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    getClaims(status)
      .then((data) => {
        if (!cancelled) setClaims(data.items || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load claims');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function mark(id, nextStatus) {
    await updateClaim(id, nextStatus);
    setClaims((items) => items.filter((claim) => claim.id !== id));
  }

  async function remove(id) {
    await deleteClaim(id);
    setClaims((items) => items.filter((claim) => claim.id !== id));
  }

  return (
    <div className="page admin-claims-page">
      <header className="editor-heading">
        <p>Claims desk</p>
        <h1>Review open filing claims.</h1>
      </header>

      <nav className="text-tabs" aria-label="Claim status">
        {statuses.map((item) => (
          <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>
            {item}
          </button>
        ))}
      </nav>

      {error && <p className="notice error">{error}</p>}

      <div className="claims-table">
        {claims.map((claim) => (
          <article className="claim-row" key={claim.id}>
            <span>{claim.id}</span>
            <Link to={`/a/${claim.annotation_id}`}>{claim.source_title || claim.annotation_id}</Link>
            <span>{claim.claimant_email}</span>
            <p>{claim.reason}</p>
            <span>{claim.status}</span>
            <div>
              <button onClick={() => mark(claim.id, 'reviewed')}>Mark reviewed</button>
              <button onClick={() => mark(claim.id, 'resolved')}>Mark resolved</button>
              <button onClick={() => remove(claim.id)}>Delete</button>
            </div>
          </article>
        ))}
        {!claims.length && <p className="feed-empty">No {status} claims.</p>}
      </div>
    </div>
  );
}
