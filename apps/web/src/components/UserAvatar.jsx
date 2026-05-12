import { useEffect, useState } from 'react';

export default function UserAvatar({ user = {}, size = 'md', className = '' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = user.display_name || user.username || 'Anonymous';
  const initials = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'A';

  useEffect(() => {
    setImageFailed(false);
  }, [user.avatar_url]);

  return (
    <span className={`avatar avatar-${size} ${className}`} aria-label={label}>
      {user.avatar_url && !imageFailed ? (
        <img src={user.avatar_url} alt="" onError={() => setImageFailed(true)} />
      ) : initials}
    </span>
  );
}
