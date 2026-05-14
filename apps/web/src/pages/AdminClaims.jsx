import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { banClaimUser, getClaims, updateClaim } from '../lib/api.js';

const REASON_LABELS = {
  copyright: 'Copyright infringement',
  misrepresentation: 'Misrepresentation',
  defamation: 'Defamation',
  privacy: 'Privacy violation',
  harassment: 'Harassment',
  other: 'Other',
};

const FILTERS = ['pending', 'reviewed', 'resolved', 'annotation_removed', 'user_blocked', 'all'];

export default function AdminClaims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    fetchClaims();
  }, [filter]);

  async function fetchClaims() {
    setLoading(true);
    setError('');
    try {
      const data = await getClaims(filter);
      setClaims(data.items || []);
    } catch (err) {
      setError(err.message || 'Could not load claims');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatus(claim, newStatus) {
    try {
      const draft = drafts[claim.id] || {};
      await updateClaim(claim.id, newStatus, {
        reviewer_note: draft.note,
        outcome: draft.outcome || defaultOutcome(newStatus),
      });
      await fetchClaims();
    } catch (err) {
      alert(err.message || 'Could not update claim');
    }
  }

  async function handleBanUser(claim) {
    const target = claim.username ? `@${claim.username}` : 'the annotation owner';
    const message = `Ban ${target}? This does not affect the claimant. It removes the account that posted the claimed annotation, hides their annotations, deletes their comments/follows/reactions, and blocks the same identity from signing up again for 30 days.`;
    if (!confirm(message)) return;
    try {
      await banClaimUser(claim.id, (drafts[claim.id]?.note || '').trim() || 'Claim review');
      await fetchClaims();
    } catch (err) {
      alert(err.message || 'Could not ban user');
    }
  }

  function updateDraft(claimId, key, value) {
    setDrafts((current) => ({
      ...current,
      [claimId]: {
        ...(current[claimId] || {}),
        [key]: value,
      },
    }));
  }

  const accessMessage = adminAccessMessage(error);

  if (loading) return <div className="page"><p>Loading claims...</p></div>;

  return (
    <div className="page">
      <Link to="/feed" className="back-link">← Feed</Link>
      <header className="editor-heading">
        <p>Admin</p>
        <h1>Claim Review</h1>
      </header>

      {accessMessage ? (
        <div className="empty-state admin-locked-state">
          <strong>{accessMessage.title}</strong>
          <p>{accessMessage.body}</p>
          <Link className="button button-outline" to="/login">Sign in with an admin account</Link>
        </div>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : claims.length === 0 ? (
        <>
          <ClaimFilters filter={filter} setFilter={setFilter} />
          <p className="feed-empty">No {filter.replace('_', ' ')} claims.</p>
        </>
      ) : (
        <>
          <ClaimFilters filter={filter} setFilter={setFilter} />
          <div className="ruled-list">
            {claims.map((claim) => (
              <article className="claim-admin-row" key={claim.id}>
                <div className="claim-admin-header">
                  <div>
                    <strong>{claim.display_name || claim.username || 'Unknown annotation owner'}</strong>
                    {claim.username && <span>@{claim.username}</span>}
                    {claim.deleted_at && <em>deleted</em>}
                  </div>
                  <span>{claim.status.replace('_', ' ')}</span>
                </div>

                <section className="claim-admin-section">
                  <strong>Annotation</strong>
                  <p>{claim.commentary}</p>
                  <a href={claim.source_url} target="_blank" rel="noreferrer">
                    {claim.source_title || claim.source_url}
                  </a>
                </section>

                <section className="claim-admin-section claim-admin-claim">
                  <strong>Claim</strong>
                  <p><span>Reason:</span> {REASON_LABELS[claim.reason_code] || claim.reason_code}</p>
                  <p><span>Claimant:</span> {claim.claimant_email}</p>
                  <p><span>Description:</span> {claim.description}</p>
                  <p><span>Email notification:</span> {claim.email_notification_status || 'not_sent'}{claim.email_notification_error ? ` - ${claim.email_notification_error}` : ''}</p>
                </section>

                <section className="claim-admin-review">
                  <label>
                    <span>Internal note</span>
                    <textarea
                      value={drafts[claim.id]?.note || claim.reviewer_note || ''}
                      onChange={(event) => updateDraft(claim.id, 'note', event.target.value)}
                      placeholder="Why you made this decision"
                    />
                  </label>
                  <label>
                    <span>Outcome summary for claimant</span>
                    <textarea
                      value={drafts[claim.id]?.outcome || claim.outcome || ''}
                      onChange={(event) => updateDraft(claim.id, 'outcome', event.target.value)}
                      placeholder="Short outcome you can paste into the response email"
                    />
                  </label>
                </section>

                <div className="claim-admin-actions">
                  <button className="button button-outline" type="button" onClick={() => handleStatus(claim, 'reviewed')}>
                    Mark reviewed
                  </button>
                  <button className="button button-solid" type="button" onClick={() => handleStatus(claim, 'resolved')}>
                    Resolve, keep annotation
                  </button>
                  <button className="button button-outline" type="button" onClick={() => handleStatus(claim, 'annotation_removed')}>
                    Remove annotation
                  </button>
                  <button className="button button-outline danger" type="button" onClick={() => handleBanUser(claim)}>
                    Ban annotation owner 30 days
                  </button>
                  <span>Filed {new Date(claim.created_at).toLocaleDateString()}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClaimFilters({ filter, setFilter }) {
  return (
    <div className="claim-admin-filters">
      {FILTERS.map((status) => (
        <button
          key={status}
          className={`button ${filter === status ? 'button-solid' : 'button-outline'}`}
          onClick={() => setFilter(status)}
          type="button"
        >
          {status.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}

function adminAccessMessage(error) {
  if (error === 'Admin authentication required') {
    return {
      title: 'Admin-only page',
      body: 'Claim Review is only visible to admin accounts. Sign in as Nick or another configured admin to review claims.',
    };
  }
  if (error === 'Admin access required') {
    return {
      title: 'Admin access required',
      body: 'You are signed in, but this account is not configured as an admin.',
    };
  }
  if (error === 'Invalid admin token') {
    return {
      title: 'Admin session expired',
      body: 'Sign in again with an admin account to continue reviewing claims.',
    };
  }
  return null;
}

function defaultOutcome(status) {
  if (status === 'resolved') return 'We reviewed the claim and are keeping the annotation live.';
  if (status === 'annotation_removed') return 'We reviewed the claim and removed the annotation from public feeds.';
  if (status === 'reviewed') return 'We have reviewed the claim and are still assessing the final outcome.';
  return '';
}
