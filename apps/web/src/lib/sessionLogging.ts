type SessionAddEventRequest = {
  type: string
  message?: string | null
  payload?: Record<string, unknown> | null
}

const ACTIVE_SESSION_KEY = 'session.activeId'

export function getActiveSessionId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY)
    const id = (raw ?? '').trim()
    return id ? id : null
  } catch {
    return null
  }
}

export function setActiveSessionId(sessionId: string | null) {
  try {
    const id = (sessionId ?? '').trim()
    if (!id) {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
      return
    }
    localStorage.setItem(ACTIVE_SESSION_KEY, id)
  } catch {
    // ignore
  }
}

export async function logSessionEvent(req: SessionAddEventRequest): Promise<void> {
  const sessionId = getActiveSessionId()
  if (!sessionId) return

  await postSessionEvent(sessionId, req)
}

export async function postSessionEvent(sessionId: string, req: SessionAddEventRequest): Promise<void> {
  const id = (sessionId ?? '').trim()
  if (!id) return

  try {
    await fetch(`http://localhost:8000/sessions/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    // non-blocking
  }
}
