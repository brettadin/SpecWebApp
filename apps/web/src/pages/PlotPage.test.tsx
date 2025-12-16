import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { PlotPage } from './PlotPage'

vi.mock('react-plotly.js', () => {
  return {
    default: (props: { data?: unknown; layout?: unknown }) => {
      const traces = Array.isArray(props.data) ? props.data : []
      return (
        <div
          data-testid="plotly"
          data-traces={JSON.stringify(traces)}
          data-layout={JSON.stringify(props.layout ?? {})}
        />
      )
    },
  }
})

type MockResponse = {
  ok: boolean
  status?: number
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}

describe('PlotPage (CAP-03)', () => {
  it('lists datasets and toggles a trace on', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<MockResponse> => {
      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'ds-1',
              name: 'My dataset',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'a.csv',
              sha256: 'x',
            },
          ],
        }
      }

      if (url.includes('/datasets/ds-1/data')) {
        return {
          ok: true,
          json: async () => ({ id: 'ds-1', x: [1, 2, 3], y: [10, 20, 30], x_unit: 'nm', y_unit: 'arb' }),
        }
      }

      return { ok: false, status: 404, text: async () => 'not found' }
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter initialEntries={['/plot']}>
        <PlotPage />
      </MemoryRouter>,
    )

    // Dataset appears in trace list
    await screen.findByText('My dataset')

    // Toggle it on
    fireEvent.click(screen.getByLabelText('Toggle My dataset'))

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const traces = JSON.parse(plot.getAttribute('data-traces') || '[]')
      expect(traces).toHaveLength(1)
      expect(traces[0].name).toBe('My dataset')
    })
  })

  it('fetches and renders range annotations when enabled', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<MockResponse> => {
      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'ds-1',
              name: 'My dataset',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'a.csv',
              sha256: 'x',
            },
          ],
        }
      }

      if (url.includes('/datasets/ds-1/data')) {
        return {
          ok: true,
          json: async () => ({ id: 'ds-1', x: [1, 2, 3], y: [10, 20, 30], x_unit: 'nm', y_unit: 'arb' }),
        }
      }

      if (url.includes('/datasets/ds-1/annotations')) {
        return {
          ok: true,
          json: async () => [
            {
              annotation_id: 'a1',
              dataset_id: 'ds-1',
              type: 'range_x',
              text: 'band',
              author_user_id: 'local/anonymous',
              created_at: '2025-12-16T00:00:00Z',
              updated_at: '2025-12-16T00:00:00Z',
              x_unit: 'nm',
              y_unit: 'arb',
              x0: 1.5,
              x1: 2.5,
              y0: null,
              y1: null,
            },
          ],
        }
      }

      return { ok: false, status: 404, text: async () => 'not found' }
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter initialEntries={['/plot']}>
        <PlotPage />
      </MemoryRouter>,
    )

    await screen.findByText('My dataset')
    fireEvent.click(screen.getByLabelText('Toggle My dataset'))

    // Enable annotations
    fireEvent.click(screen.getByLabelText('Show annotations'))

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const layout = JSON.parse(plot.getAttribute('data-layout') || '{}')
      expect(Array.isArray(layout.shapes)).toBe(true)
      expect(layout.shapes.length).toBeGreaterThan(0)
    })
  })
})
