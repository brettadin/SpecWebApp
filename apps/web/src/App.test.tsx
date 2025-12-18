import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import uiContract from '../../../docs/ui_contract.json'

describe('App navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    // Keep the UI shell deterministic for tests.
    localStorage.setItem('ui.leftCollapsed', 'false')
    localStorage.setItem('ui.rightCollapsed', 'true')
    vi.unstubAllGlobals()
  })

  it('renders required nav test ids', () => {
    render(
      <MemoryRouter initialEntries={['/plot']}>
        <App />
      </MemoryRouter>,
    )

    for (const id of uiContract.requiredNavTestIds) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })

  it('renders library panel and a route page', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <App />
      </MemoryRouter>,
    )

    // Library is always present as the left panel.
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    // /library redirects to /plot in the center workbench.
    expect(screen.getByRole('heading', { name: 'Plot' })).toBeInTheDocument()
  })

  it('auto-runs MAST search once per token (CAP-15 handoff)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [],
          text: async () => '',
        } as Response
      }

      if (url.endsWith('/sessions')) {
        return {
          ok: true,
          json: async () => [],
          text: async () => '',
        } as Response
      }

      if (url.includes('/telescope/mast/caom-search')) {
        return {
          ok: true,
          json: async () => ({ status: 'COMPLETE', data: [] }),
          text: async () => '',
        } as Response
      }

      // Default non-fatal stub for any incidental calls.
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter
        initialEntries={[
          '/plot?mastTarget=83.6331%20-5.3911&mastAutoSearch=1&mastToken=tok-1&mastRadius=0.2',
        ]}
      >
        <App />
      </MemoryRouter>,
    )

    // Wait for the main route to render.
    expect(await screen.findByRole('heading', { name: 'Plot' })).toBeInTheDocument()

    const caomCallsLen = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/telescope/mast/caom-search')).length

    await waitFor(() => {
      expect(caomCallsLen()).toBe(1)
    })

    // Ensure internal state changes (e.g., setting fields) do not retrigger the auto-run.
    await new Promise((r) => setTimeout(r, 25))
    expect(caomCallsLen()).toBe(1)
  })

  it('pressing Enter with coordinates launches MAST (CAP-15)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [],
          text: async () => '',
        } as Response
      }

      if (url.endsWith('/sessions')) {
        return {
          ok: true,
          json: async () => [],
          text: async () => '',
        } as Response
      }

      if (url.includes('/telescope/mast/caom-search')) {
        return {
          ok: true,
          json: async () => ({ status: 'COMPLETE', data: [] }),
          text: async () => '',
        } as Response
      }

      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter initialEntries={['/plot']}>
        <App />
      </MemoryRouter>,
    )

    const input = screen.getByLabelText('Global search')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '83.6331 -5.3911' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const caomCallsLen = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/telescope/mast/caom-search')).length
    await waitFor(() => {
      expect(caomCallsLen()).toBe(1)
    })
  })
})
