/** مسارات عامة لا تحتاج basic auth على السيرفر (Caddy) */
export const PUBLIC_PATHS = {
  teacherLookup: '/teacher-lookup',
  portal: '/portal',
};

/** على VPS نستخدم مسارات عادية؛ محلياً/file قد يُستخدم hash */
export function isPathBasedRouting() {
  return typeof window !== 'undefined' && window.location.protocol.startsWith('http');
}

export function buildPublicUrl(path) {
  if (typeof window === 'undefined') return path;
  const origin = window.location.origin;
  if (isPathBasedRouting()) {
    return `${origin}${path}`;
  }
  const base = window.location.pathname || '/';
  return `${origin}${base}#${path}`;
}
