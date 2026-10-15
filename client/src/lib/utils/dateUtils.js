/**
 * Ensure an ISO datetime string is treated as UTC by appending 'Z'
 * if no timezone offset is present. This prevents the browser from
 * misinterpreting naive UTC timestamps as local time.
 */
function toUTC(iso) {
  if (!iso) return null
  // If already has timezone info (Z, +HH:MM, -HH:MM), leave it alone
  if (/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso)) return iso
  return iso + 'Z'
}

const IST_LOCALE = 'en-IN'
const IST_TZ = 'Asia/Kolkata'

/**
 * Format an ISO datetime string to a readable IST date label.
 * e.g. "2026-04-17T10:30:00" (UTC)  "17 Apr 2026" (IST)
 */
export function formatDate(iso) {
  if (!iso) return '-'
  return new Date(toUTC(iso)).toLocaleDateString(IST_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TZ,
  })
}

/**
 * Format an ISO datetime string to a readable IST date+time label.
 * e.g. "2026-04-17T05:00:00" (UTC)  "17 Apr 2026, 10:30 AM" (IST)
 */
export function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(toUTC(iso)).toLocaleString(IST_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST_TZ,
  })
}

/**
 * Returns true if today (IST) is between valid_from and valid_to.
 * The date inputs are plain YYYY-MM-DD strings (no time component).
 */
export function isActiveByDate(validFrom, validTo) {
  const now = new Date()
  return new Date(toUTC(validFrom)) <= now && now <= new Date(toUTC(validTo))
}

/**
 * Returns the number of calendar days remaining until a deadline (UTC).
 */
export function daysRemaining(deadline) {
  const diff = new Date(toUTC(deadline)) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
