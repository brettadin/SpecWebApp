export type ResolvedCoords = {
  ra: number
  dec: number
}

export type TargetResolutionCandidate = {
  label: string
  ra: number
  dec: number
}

export type TargetResolutionCacheEntry = {
  retrieved_at: string
  candidates: TargetResolutionCandidate[]
}

function normKey(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase()
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function parseRaDecDegrees(input: string): ResolvedCoords | null {
  const raw = input.trim()
  if (!raw) return null

  // Accept patterns like:
  // - "83.6331 -5.3911"
  // - "83.6331, -5.3911"
  // - "ra=83.6331 dec=-5.3911"
  // - "ra: 83.6331, dec: -5.3911"
  const raMatch = raw.match(/\bra\s*[:=]\s*([+-]?(?:\d+\.?\d*|\d*\.?\d+))\b/i)
  const decMatch = raw.match(/\bdec\s*[:=]\s*([+-]?(?:\d+\.?\d*|\d*\.?\d+))\b/i)
  if (raMatch && decMatch) {
    const ra = Number(raMatch[1])
    const dec = Number(decMatch[1])
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null
    if (dec < -90 || dec > 90) return null
    const raWrapped = ra >= 0 && ra < 360 ? ra : ((ra % 360) + 360) % 360
    return { ra: raWrapped, dec }
  }

  const cleaned = raw
    .replace(/[()]/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length !== 2) return null

  const ra = Number(parts[0])
  const dec = Number(parts[1])
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null
  if (dec < -90 || dec > 90) return null

  const raWrapped = ra >= 0 && ra < 360 ? ra : ((ra % 360) + 360) % 360
  return { ra: raWrapped, dec }
}

const CACHE_PREFIX = 'targetResolution.cache:'

export function loadTargetResolutionCache(input: string): TargetResolutionCacheEntry | null {
  try {
    const key = CACHE_PREFIX + normKey(input)
    const parsed = safeJsonParse<TargetResolutionCacheEntry>(localStorage.getItem(key))
    if (!parsed || typeof parsed !== 'object') return null

    const retrieved_at = typeof parsed.retrieved_at === 'string' ? parsed.retrieved_at : ''
    const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : []

    const candidates: TargetResolutionCandidate[] = []
    for (const c of candidatesRaw) {
      if (!c || typeof c !== 'object') continue
      const obj = c as Record<string, unknown>
      const label = typeof obj.label === 'string' ? obj.label : ''
      const ra = obj.ra
      const dec = obj.dec
      if (!label.trim() || !isFiniteNumber(ra) || !isFiniteNumber(dec)) continue
      candidates.push({ label, ra, dec })
    }

    if (!retrieved_at || !candidates.length) return null
    return { retrieved_at, candidates }
  } catch {
    return null
  }
}

export function saveTargetResolutionCache(input: string, entry: TargetResolutionCacheEntry): void {
  try {
    const key = CACHE_PREFIX + normKey(input)
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // ignore
  }
}

const PREF_PREFIX = 'targetResolution.pref:'

export function loadTargetResolutionPreference(input: string): ResolvedCoords | null {
  try {
    const key = PREF_PREFIX + normKey(input)
    const parsed = safeJsonParse<{ ra?: unknown; dec?: unknown }>(localStorage.getItem(key))
    if (!parsed) return null
    const ra = parsed.ra
    const dec = parsed.dec
    if (!isFiniteNumber(ra) || !isFiniteNumber(dec)) return null
    return { ra, dec }
  } catch {
    return null
  }
}

export function saveTargetResolutionPreference(input: string, coords: ResolvedCoords): void {
  try {
    const key = PREF_PREFIX + normKey(input)
    localStorage.setItem(key, JSON.stringify(coords))
  } catch {
    // ignore
  }
}
