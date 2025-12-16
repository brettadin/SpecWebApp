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

  it('computes A-B differential and adds a derived trace', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<MockResponse> => {
      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'ds-1',
              name: 'A trace',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'a.csv',
              sha256: 'x',
            },
            {
              id: 'ds-2',
              name: 'B trace',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'b.csv',
              sha256: 'y',
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

      if (url.includes('/datasets/ds-2/data')) {
        return {
          ok: true,
          json: async () => ({ id: 'ds-2', x: [1, 2, 3], y: [1, 2, 3], x_unit: 'nm', y_unit: 'arb' }),
        }
      }

      if (url.includes('/annotations')) {
        return { ok: true, json: async () => [] }
      }

      return { ok: false, status: 404, text: async () => 'not found' }
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter initialEntries={['/plot']}>
        <PlotPage />
      </MemoryRouter>,
    )

    await screen.findByText('A trace')
    await screen.findByText('B trace')

    // Load both series by toggling visible.
    fireEvent.click(screen.getByLabelText('Toggle A trace'))
    fireEvent.click(screen.getByLabelText('Toggle B trace'))

    // Select A and B in differential panel.
    fireEvent.change(screen.getByLabelText('Trace A'), { target: { value: 'o:ds-1' } })
    fireEvent.change(screen.getByLabelText('Trace B'), { target: { value: 'o:ds-2' } })

    fireEvent.click(screen.getByText('Compute'))

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const traces = JSON.parse(plot.getAttribute('data-traces') || '[]')
      // Should include a derived trace with CAP-06 prefix.
      expect(traces.some((t: { name?: string }) => (t.name ?? '').includes('A-B'))).toBe(true)
    })
  })

  it('renders line list datasets as stick bars (CAP-07)', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<MockResponse> => {
      if (url.endsWith('/datasets')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'lines-1',
              name: 'NIST ASD Lines',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'lines.csv',
              sha256: 'z',
            },
          ],
        }
      }

      if (url.includes('/datasets/lines-1/data')) {
        return {
          ok: true,
          json: async () => ({
            id: 'lines-1',
            x: [500, 600, 700],
            y: [1, 2, 3],
            x_unit: 'nm',
            y_unit: null,
            reference: { data_type: 'LineList', source_name: 'NIST ASD', citation_text: 'cite' },
          }),
        }
      }

      if (url.includes('/annotations')) {
        return { ok: true, json: async () => [] }
      }

      return { ok: false, status: 404, text: async () => 'not found' }
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <MemoryRouter initialEntries={['/plot']}>
        <PlotPage />
      </MemoryRouter>,
    )

    await screen.findByText('NIST ASD Lines')
    fireEvent.click(screen.getByLabelText('Toggle NIST ASD Lines'))

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const traces = JSON.parse(plot.getAttribute('data-traces') || '[]')
      expect(traces).toHaveLength(1)
      expect(traces[0].type).toBe('bar')
    })
  })
})
