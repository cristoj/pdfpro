import { describe, it, expect } from 'vitest'
import { sanitizeColor, isValidHexColor, hasPdfMagicBytes, areValidPageIndices } from './validation.js'

// ── sanitizeColor ─────────────────────────────────────────────

describe('sanitizeColor', () => {
  it('returns the value for a valid lowercase hex color', () => {
    expect(sanitizeColor('#a3b2c1')).toBe('#a3b2c1')
  })

  it('returns the value for a valid uppercase hex color', () => {
    expect(sanitizeColor('#FFFFFF')).toBe('#FFFFFF')
  })

  it('returns the value for a mixed-case hex color', () => {
    expect(sanitizeColor('#00fF88')).toBe('#00fF88')
  })

  it('returns the default fallback for an empty string', () => {
    expect(sanitizeColor('')).toBe('#000000')
  })

  it('returns the default fallback for a 3-digit hex color', () => {
    expect(sanitizeColor('#fff')).toBe('#000000')
  })

  it('returns the default fallback for a color without hash', () => {
    expect(sanitizeColor('ffffff')).toBe('#000000')
  })

  it('returns the default fallback for script injection attempt', () => {
    expect(sanitizeColor('<script>alert(1)</script>')).toBe('#000000')
  })

  it('returns the default fallback for non-string input', () => {
    expect(sanitizeColor(null)).toBe('#000000')
    expect(sanitizeColor(undefined)).toBe('#000000')
    expect(sanitizeColor(123)).toBe('#000000')
  })

  it('uses the provided custom fallback when invalid', () => {
    expect(sanitizeColor('bad', '#ff0000')).toBe('#ff0000')
  })
})

// ── isValidHexColor ───────────────────────────────────────────

describe('isValidHexColor', () => {
  it('returns true for valid 6-digit hex colors', () => {
    expect(isValidHexColor('#000000')).toBe(true)
    expect(isValidHexColor('#ABCDEF')).toBe(true)
    expect(isValidHexColor('#1a2b3c')).toBe(true)
  })

  it('returns false for 3-digit hex colors', () => {
    expect(isValidHexColor('#FFF')).toBe(false)
  })

  it('returns false for colors without hash prefix', () => {
    expect(isValidHexColor('000000')).toBe(false)
  })

  it('returns false for injection strings', () => {
    expect(isValidHexColor('"onmouseover=alert(1)')).toBe(false)
    expect(isValidHexColor('#00000g')).toBe(false)
  })

  it('returns false for non-string types', () => {
    expect(isValidHexColor(null)).toBe(false)
    expect(isValidHexColor(0xFFFFFF)).toBe(false)
  })
})

// ── hasPdfMagicBytes ──────────────────────────────────────────

describe('hasPdfMagicBytes', () => {
  it('returns true for a buffer starting with %PDF', () => {
    const buf = Buffer.from('%PDF-1.4 rest of file')
    expect(hasPdfMagicBytes(buf)).toBe(true)
  })

  it('returns false for a buffer that does not start with %PDF', () => {
    const buf = Buffer.from('<!DOCTYPE html>')
    expect(hasPdfMagicBytes(buf)).toBe(false)
  })

  it('returns false for a buffer shorter than 4 bytes', () => {
    expect(hasPdfMagicBytes(Buffer.from('%PD'))).toBe(false)
    expect(hasPdfMagicBytes(Buffer.alloc(0))).toBe(false)
  })

  it('returns false for null or non-Buffer input', () => {
    expect(hasPdfMagicBytes(null)).toBe(false)
    expect(hasPdfMagicBytes('%PDF')).toBe(false)
  })

  it('returns false for a PNG magic bytes buffer', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(hasPdfMagicBytes(png)).toBe(false)
  })

  it('returns true for a buffer starting with the exact %PDF bytes', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(hasPdfMagicBytes(buf)).toBe(true)
  })
})

// ── areValidPageIndices ───────────────────────────────────────

describe('areValidPageIndices', () => {
  it('returns true for valid in-range integer indices', () => {
    expect(areValidPageIndices([0, 1, 2], 3)).toBe(true)
  })

  it('returns true for a single valid index', () => {
    expect(areValidPageIndices([0], 5)).toBe(true)
  })

  it('returns false for an empty array', () => {
    expect(areValidPageIndices([], 5)).toBe(false)
  })

  it('returns false for non-array input', () => {
    expect(areValidPageIndices(null, 5)).toBe(false)
    expect(areValidPageIndices('0,1', 5)).toBe(false)
  })

  it('returns false when an index equals total (out of bounds)', () => {
    expect(areValidPageIndices([5], 5)).toBe(false)
  })

  it('returns false for a negative index', () => {
    expect(areValidPageIndices([-1], 5)).toBe(false)
  })

  it('returns false for float indices', () => {
    expect(areValidPageIndices([1.5], 5)).toBe(false)
  })

  it('returns false if any element is a string', () => {
    expect(areValidPageIndices([0, '1', 2], 5)).toBe(false)
  })

  it('returns false if total is 0', () => {
    expect(areValidPageIndices([0], 0)).toBe(false)
  })
})
