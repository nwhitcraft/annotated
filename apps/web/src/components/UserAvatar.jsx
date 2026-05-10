export default function UserAvatar({ user = {}, size = 'md', className = '' }) {
  const label = user.display_name || user.username || 'Anonymous';
  const initial = label.trim().charAt(0).toUpperCase() || 'A';

  return (
    <span className={`user-avatar user-avatar-${size} ${className}`} aria-label={label}>
      {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initial}
    </span>
  );
}
