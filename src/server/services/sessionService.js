import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs/promises'

const TTL_MS = Number(process.env.SESSION_TTL_MS ?? 3_600_000)

const sessions = new Map()

/**
 * Delete all files associated with a session from disk.
 * @param {{ filePath?: string, signedFilePath?: string }} session
 */
function cleanSessionFiles(session) {
  if (session.filePath) fs.unlink(session.filePath).catch(() => {})
  // FINDING-06: also clean up signed PDF created by /import-signed-pdf
  if (session.signedFilePath) fs.unlink(session.signedFilePath).catch(() => {})
}

function purgeExpired() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > TTL_MS) {
      sessions.delete(id)
      cleanSessionFiles(session)
    }
  }
}

export function createSession(filePath, pages) {
  const id = uuidv4()
  sessions.set(id, { id, filePath, pages, textBlocks: [], createdAt: Date.now() })
  return id
}

export function getSession(id) {
  purgeExpired()
  return sessions.get(id) ?? null
}

export function updateSession(id, patch) {
  const session = sessions.get(id)
  if (!session) return null
  const updated = { ...session, ...patch }
  sessions.set(id, updated)
  return updated
}

export function deleteSession(id) {
  const session = sessions.get(id)
  if (session) cleanSessionFiles(session)
  sessions.delete(id)
}

export function _clearAll() {
  sessions.clear()
}
