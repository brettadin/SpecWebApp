export type MastHandoffPrefs = {
  radiusDeg?: number
  mission?: 'JWST' | 'HST' | 'HLSP' | ''
  dataType?: 'spectrum' | 'cube' | ''
}

const PREF_KEY = 'mast.handoff.prefs'

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadMastHandoffPrefs(): MastHandoffPrefs {
  try {
    const parsed = safeJsonParse<Record<string, unknown>>(localStorage.getItem(PREF_KEY))
    if (!parsed) return {}

    const radiusRaw = parsed.radiusDeg
    const radiusDeg = typeof radiusRaw === 'number' && Number.isFinite(radiusRaw) ? radiusRaw : undefined

    const missionRaw = parsed.mission
    const mission =
      missionRaw === 'JWST' || missionRaw === 'HST' || missionRaw === 'HLSP' || missionRaw === '' ? missionRaw : undefined

    const dataTypeRaw = parsed.dataType
    const dataType = dataTypeRaw === 'spectrum' || dataTypeRaw === 'cube' || dataTypeRaw === '' ? dataTypeRaw : undefined

    return { radiusDeg, mission, dataType }
  } catch {
    return {}
  }
}

export function saveMastHandoffPrefs(prefs: MastHandoffPrefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

export function buildMastHandoffUrl(args: {
  target: string
  autoSearch: boolean
  token: string
  prefs?: MastHandoffPrefs
}): string {
  const params = new URLSearchParams()
  params.set('mastTarget', args.target)
  if (args.autoSearch) params.set('mastAutoSearch', '1')
  params.set('mastToken', args.token)

  const prefs = args.prefs
  if (prefs?.radiusDeg != null && Number.isFinite(prefs.radiusDeg) && prefs.radiusDeg > 0) {
    params.set('mastRadius', String(prefs.radiusDeg))
  }
  if (prefs?.mission != null && prefs.mission !== '') {
    params.set('mastMission', prefs.mission)
  }
  if (prefs?.dataType != null && prefs.dataType !== '') {
    params.set('mastDataType', prefs.dataType)
  }

  return `/plot?${params.toString()}`
}
