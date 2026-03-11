/**
 * Centralized date formatting - always in user's browser timezone.
 * Use for all displayed dates (createdAt, updatedAt, rejectedAt, etc.)
 * to avoid production UTC vs local timezone confusion.
 */
import dayjs from 'dayjs'

/** Format date for display: "11 Mar 2026, 03:55 PM" (user's local timezone) */
export function formatDateTime(d) {
  if (!d) return '—'
  const dt = dayjs(d)
  if (!dt.isValid()) return '—'
  return dt.format('DD MMM YYYY, hh:mm A')
}

/** Format date only: "11 Mar 2026" */
export function formatDate(d) {
  if (!d) return '—'
  const dt = dayjs(d)
  if (!dt.isValid()) return '—'
  return dt.format('DD MMM YYYY')
}
