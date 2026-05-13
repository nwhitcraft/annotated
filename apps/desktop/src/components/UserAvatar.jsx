import { useEffect, useState } from 'react';

export default function UserAvatar({ user, size = 'md', className = '' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = user?.display_name || user?.username || 'Account';

  useEffect(() => {
    setImageFailed(false);
  }, [user?.avatar_url]);

  return (
    <span className={`avatar avatar-${size} ${className}`} aria-label={label}>
      {user?.avatar_url && !imageFailed ? (
        <img src={user.avatar_url} alt="" onError={() => setImageFailed(true)} />
      ) : (
        initials(label)
      )}
    </span>
  );
}

function initials(value) {
  const parts = String(value || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
