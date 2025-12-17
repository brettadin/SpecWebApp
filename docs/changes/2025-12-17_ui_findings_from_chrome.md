# 2025-12-17 — UI findings from Chrome (user notes)

Source: screenshots + user report while running in Chrome.

## Blockers
- **Importing/uploading data does not work** (Library shows “Failed to fetch”; can’t import/preview datasets).
- **Cannot test downstream features** (Plot/Inspector features depend on imported datasets).

## UX / behavior issues
- **Citation text required to search** feels odd/too strict.
- **Notebook placement/behavior is inconsistent**:
  - Notebook appears at the bottom of the Inspector tab.
  - Clicking Docs shows notebook as its own right-side tab.
  - On Plot, notebook appears at the bottom of the right-side tab.

## Feature feedback
- **Annotations**
  - Manual entry (type x/y) is OK.
  - Requested: **click on the graph to insert annotations** (graph interaction → create point annotation) in addition to manual entry.

## Reference data / line lists / reference spectrum
- Current UI expects the user to **paste a URL** for line lists and reference spectra.
- Desired: **search/browse within the app** → pick dataset → import in one click.
- Still want the resulting source link/provenance displayed after selection/import.

## Likely contributing technical causes (initial suspicion)
- Web currently uses hardcoded API URLs (`http://localhost:8000`) in pages; if the API isn’t running, is on a different port, or CORS blocks requests, the UI shows “Failed to fetch”.
- Vite dev server config currently does not define an `/api` proxy.
