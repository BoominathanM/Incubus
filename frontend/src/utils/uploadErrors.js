export function getUploadErrorMessage(err) {
  const msg = err?.data?.message || err?.message || ''
  if (typeof msg !== 'string') return 'File upload failed. Please use a PDF, JPEG, JPG or PNG file (max 25MB) and try again.'
  const m = msg.trim()
  if (m.includes('too large') || m.includes('25MB')) return m
  if (m.includes('Only PDF') || m.includes('allowed')) return m
  if (m.includes('not configured') || m.includes('contact support')) return m
  if (m.includes('Invalid file')) return m
  if (m.length > 10 && m.length < 200 && !m.includes('ECONNREFUSED') && !m.includes('socket')) return m
  return 'File upload failed. Please use a PDF, JPEG, JPG or PNG file (max 25MB) and try again.'
}
