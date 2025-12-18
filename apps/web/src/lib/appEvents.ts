const DATASETS_CHANGED_EVENT = 'datasets:changed'

export function notifyDatasetsChanged() {
  try {
    window.dispatchEvent(new Event(DATASETS_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

export function onDatasetsChanged(handler: () => void): () => void {
  const h = () => handler()
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
