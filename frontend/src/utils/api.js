export function getApiBase() {
  if (typeof window === 'undefined') return import.meta.env.VITE_API_URL || ''
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return ''
  return import.meta.env.VITE_API_URL || ''
}
