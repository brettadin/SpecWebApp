const DATASETS_CHANGED_EVENT = 'datasets:changed'

export type DatasetsChangedDetail = {
  datasetId?: string
  reason?: string
}

export function notifyDatasetsChanged(detail?: DatasetsChangedDetail) {
  try {
    if (detail && (detail.datasetId || detail.reason)) {
      window.dispatchEvent(new CustomEvent<DatasetsChangedDetail>(DATASETS_CHANGED_EVENT, { detail }))
    } else {
      window.dispatchEvent(new Event(DATASETS_CHANGED_EVENT))
    }
  } catch {
    // ignore
  }
}

export function onDatasetsChanged(handler: (detail?: DatasetsChangedDetail) => void): () => void {
  const h = (e: Event) => {
    const ev = e as CustomEvent<DatasetsChangedDetail>
    handler(ev?.detail)
  }
  try {
    window.addEventListener(DATASETS_CHANGED_EVENT, h)
  } catch {
    // ignore
  }

  return () => {
    try {
      window.removeEventListener(DATASETS_CHANGED_EVENT, h)
    } catch {
      // ignore
    }
  }
}
