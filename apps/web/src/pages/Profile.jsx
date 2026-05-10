import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AnnotationCard from '../components/AnnotationCard.jsx';

export default function Profile() {
  const { username } = useParams();
  const [user, setUser] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${username}`).then(r => r.json()),
      fetch(`/api/users/${username}/annotations`).then(r => r.json()),
    ])
      .then(([userData, annData]) => {
        setUser(userData);
        setAnnotations(annData.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 680 }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  if (!user || user.error) {
    return (
      <div className="container" style={{ maxWidth: 680, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
        <h2>User not found</h2>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 680 }}>
      {/* Profile header */}
      <div className="profile-header card" style={{ textAlign: 'center', marginBottom: 32 }}>
        <div className="avatar avatar-lg avatar-placeholder" style={{ margin: '0 auto 12px', fontSize: 24 }}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="avatar avatar-lg" />
            : (user.display_name || user.username)[0].toUpperCase()
          }
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{user.display_name || user.username}</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>@{user.username}</p>
        {user.bio && <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{user.bio}</p>}
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user.stats?.annotations || 0}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>annotations</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user.stats?.followers || 0}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>followers</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user.stats?.following || 0}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>following</div>
          </div>
        </div>
      </div>

      {/* Annotations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {annotations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <p className="text-secondary">No annotations yet.</p>
          </div>
        ) : (
          annotations.map(a => <AnnotationCard key={a.id} annotation={a} />)
        )}
      </div>
    </div>
  );
}
