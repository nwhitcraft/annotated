import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'annotated-dev-secret-change-in-prod';

/**
 * Require a valid JWT. Sets c.set('userId', ...) and c.set('user', ...) on success.
 */
export function requireAuth(c, next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    c.set('userId', payload.sub);
    c.set('user', payload);
    return next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

/**
 * Optional auth — sets userId if token present but doesn't block.
 * Useful for endpoints that behave differently for logged-in users
 * (e.g., showing whether current user liked an annotation).
 */
export function optionalAuth(c, next) {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      c.set('userId', payload.sub);
      c.set('user', payload);
    } catch {
      // Invalid token — proceed as anonymous
    }
  }
  return next();
}
