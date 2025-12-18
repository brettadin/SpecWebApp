export type CachedDataset = {
  id: string
  name: string
  created_at?: string
}

const CACHE_KEY = 'datasets.cache:v1'

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function loadCachedDatasets(): CachedDataset[] {
  try {
    const parsed = safeJsonParse(localStorage.getItem(CACHE_KEY))
    if (!Array.isArray(parsed)) return []

    const out: CachedDataset[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const obj = row as Record<string, unknown>
      const id = typeof obj.id === 'string' ? obj.id : ''
      const name = typeof obj.name === 'string' ? obj.name : ''
      const created_at = typeof obj.created_at === 'string' ? obj.created_at : undefined
      if (!id.trim()) continue
      out.push({ id, name: name || id, created_at })
    }

    return out
  } catch {
    return []
  }
}

export function saveCachedDatasets(datasets: Array<{ id: string; name: string; created_at?: string }>): void {
  try {
    const slim = datasets
      .filter((d) => d && typeof d.id === 'string' && d.id.trim())
      .slice(0, 200)
      .map((d) => ({ id: d.id, name: d.name || d.id, created_at: d.created_at }))

    localStorage.setItem(CACHE_KEY, JSON.stringify(slim))
  } catch {
    // ignore
  }
}
