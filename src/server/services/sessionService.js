import { v4 as uuidv4 } from 'uuid'

const TTL_MS = Number(process.env.SESSION_TTL_MS ?? 3_600_000)

const sessions = new Map()

function purgeExpired() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > TTL_MS) {
      sessions.delete(id)
    }
  }
}

export function createSession(filePath, pages) {
  const id = uuidv4()
  sessions.set(id, { id, filePath, pages, createdAt: Date.now() })
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
  sessions.delete(id)
}

export function _clearAll() {
  sessions.clear()
}
