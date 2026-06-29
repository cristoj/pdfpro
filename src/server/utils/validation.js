/**
 * Shared validation utilities for server-side input checks.
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Returns the value if it is a valid 6-digit hex color string, otherwise the fallback.
 * @param {unknown} value
 * @param {string} [fallback='#000000']
 * @returns {string}
 */
export function sanitizeColor(value, fallback = '#000000') {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : fallback
}

/**
 * Returns true if value is a valid 6-digit hex color string.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

/**
 * Returns true if the first 4 bytes of a Buffer match the PDF magic number (%PDF).
 * @param {Buffer} buf
 * @returns {boolean}
 */
export function hasPdfMagicBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false
  return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
}

/**
 * Validates that every element of an array is a non-negative integer less than total.
 * @param {unknown[]} indices
 * @param {number} total
 * @returns {boolean}
 */
export function areValidPageIndices(indices, total) {
  if (!Array.isArray(indices) || indices.length === 0) return false
  return indices.every(
    (i) => Number.isInteger(i) && i >= 0 && i < total,
  )
}
