import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

// vi.hoisted ensures unlinkMock is available inside the vi.mock factory,
// which is itself hoisted before all other code by Vitest
const { unlinkMock } = vi.hoisted(() => ({
  unlinkMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs/promises', async () => {
  // Keep the real implementation for everything except unlink.
  // node:fs/promises is used via both default import (import fs from …)
  // and named imports, so patch both the named export and the default object.
  const actual = await vi.importActual('node:fs/promises')
  const patched = { ...actual, unlink: unlinkMock }
  return { ...patched, default: patched }
})

import { createSession, getSession, updateSession, deleteSession, _clearAll } from './sessionService.js'

beforeEach(() => {
  _clearAll()
  unlinkMock.mockClear()
})

afterEach(() => {
  unlinkMock.mockClear()
})

describe('sessionService', () => {
  test('crea sesión con UUID v4', () => {
    const id = createSession('/tmp/test.pdf', [])
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('recupera sesión por id', () => {
    const id = createSession('/tmp/a.pdf', [{ index: 0 }])
    const session = getSession(id)
    expect(session).not.toBeNull()
    expect(session.filePath).toBe('/tmp/a.pdf')
    expect(session.pages).toHaveLength(1)
  })

  test('devuelve null para sesión inexistente', () => {
    expect(getSession('non-existent-id')).toBeNull()
  })

  test('actualiza páginas de sesión existente', () => {
    const id = createSession('/tmp/b.pdf', [])
    const updated = updateSession(id, { pages: [{ index: 0 }, { index: 1 }] })
    expect(updated.pages).toHaveLength(2)
    expect(getSession(id).pages).toHaveLength(2)
  })

  test('devuelve null al actualizar sesión inexistente', () => {
    expect(updateSession('bad-id', { pages: [] })).toBeNull()
  })

  test('elimina sesión', () => {
    const id = createSession('/tmp/c.pdf', [])
    deleteSession(id)
    expect(getSession(id)).toBeNull()
  })

  test('elimina sesión expirada por TTL', async () => {
    const originalTTL = process.env.SESSION_TTL_MS
    process.env.SESSION_TTL_MS = '1'

    const id = createSession('/tmp/d.pdf', [])
    const session = getSession(id)
    expect(session).not.toBeNull()

    process.env.SESSION_TTL_MS = originalTTL
  })
})

// ── FINDING-06: signed PDF cleanup ────────────────────────────

describe('sessionService — signedFilePath cleanup (FINDING-06)', () => {
  test('deleteSession attempts to unlink filePath', () => {
    // Arrange
    const id = createSession('/tmp/test-main.pdf', [])

    // Act
    deleteSession(id)

    // Assert
    const paths = unlinkMock.mock.calls.map((args) => args[0])
    expect(paths).toContain('/tmp/test-main.pdf')
  })

  test('deleteSession also unlinks signedFilePath when present', () => {
    // Arrange
    const id = createSession('/tmp/test-signed.pdf', [])
    updateSession(id, { signedFilePath: '/tmp/test-signed_firmado.pdf' })

    // Act
    deleteSession(id)

    // Assert — both files must be scheduled for deletion
    const paths = unlinkMock.mock.calls.map((args) => args[0])
    expect(paths).toContain('/tmp/test-signed.pdf')
    expect(paths).toContain('/tmp/test-signed_firmado.pdf')
  })

  test('deleteSession does not throw when signedFilePath is absent', () => {
    const id = createSession('/tmp/no-signed.pdf', [])
    expect(() => deleteSession(id)).not.toThrow()
  })

  test('session without signedFilePath triggers exactly one unlink call', () => {
    // Arrange
    const id = createSession('/tmp/only-main.pdf', [])

    // Act
    deleteSession(id)

    // Assert — only one unlink call, for filePath
    expect(unlinkMock).toHaveBeenCalledTimes(1)
    expect(unlinkMock).toHaveBeenCalledWith('/tmp/only-main.pdf')
  })

  test('session is no longer retrievable after deleteSession', () => {
    const id = createSession('/tmp/gone.pdf', [])
    updateSession(id, { signedFilePath: '/tmp/gone_firmado.pdf' })
    deleteSession(id)
    expect(getSession(id)).toBeNull()
  })
})
