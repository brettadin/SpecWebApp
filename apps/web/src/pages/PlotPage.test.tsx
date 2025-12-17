import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('runs Feature Finder (CAP-09) and plots feature markers', async () => {
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
          json: async () => ({ id: 'ds-1', x: [0, 1, 2, 3, 4], y: [0, 1, 0, 2, 0], x_unit: 'nm', y_unit: 'arb' }),
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

    // Run CAP-09 Feature Finder.
    fireEvent.click(screen.getByText('Run'))

    await screen.findByText('Results (2)')

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const traces = JSON.parse(plot.getAttribute('data-traces') || '[]')
      expect(traces.some((t: { name?: string }) => (t.name ?? '').includes('(features)'))).toBe(true)
    })
  })

  it('highlights a feature marker when clicking a feature row (CAP-09)', async () => {
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
          json: async () => ({ id: 'ds-1', x: [0, 1, 2, 3, 4], y: [0, 1, 0, 2, 0], x_unit: 'nm', y_unit: 'arb' }),
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

    fireEvent.click(screen.getByText('Run'))
    await screen.findByText('Results (2)')

    // Click the first feature row (x=1.000000) to highlight.
    fireEvent.click(screen.getByText('1.000000'))

    await waitFor(() => {
      const plot = screen.getByTestId('plotly')
      const traces = JSON.parse(plot.getAttribute('data-traces') || '[]')
      expect(traces.some((t: { name?: string }) => (t.name ?? '').includes('(selected feature)'))).toBe(true)
    })
  })

  it('matches detected features to a line list within tolerance (CAP-09)', async () => {
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
            {
              id: 'lines-1',
              name: 'NIST ASD Lines',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'lines.csv',
              sha256: 'z',
              reference: { data_type: 'LineList', source_name: 'NIST ASD', citation_present: true },
            },
          ],
        }
      }

      if (url.includes('/datasets/ds-1/data')) {
        return {
          ok: true,
          json: async () => ({
            id: 'ds-1',
            x: [0, 1, 2, 3, 4],
            y: [0, 1, 0, 2, 0],
            x_unit: 'nm',
            y_unit: 'arb',
          }),
        }
      }

      if (url.includes('/datasets/lines-1/data')) {
        return {
          ok: true,
          json: async () => ({
            id: 'lines-1',
            x: [1.05, 2.0, 3.1],
            y: [10, 1, 5],
            x_unit: 'nm',
            y_unit: null,
            reference: {
              data_type: 'LineList',
              source_name: 'NIST ASD',
              source_url: 'https://example.test/nist',
              retrieved_at: '2025-12-16T00:00:00Z',
              citation_text: 'cite',
            },
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

    await screen.findByText('My dataset')
    fireEvent.click(screen.getByLabelText('Toggle My dataset'))

    // Run Feature Finder to generate features.
    fireEvent.click(screen.getByText('Run'))
    await screen.findByText('Results (2)')

    // Run matching against the line list.
    fireEvent.change(screen.getByLabelText('Match reference dataset'), { target: { value: 'lines-1' } })
    fireEvent.change(screen.getByLabelText('Match tolerance'), { target: { value: '0.2' } })
    fireEvent.click(screen.getByText('Run match'))

    await screen.findByText('Apply top match labels to annotations')
    expect(screen.getAllByText(/Line @/i).length).toBeGreaterThan(0)

    const matchSection = screen.getByText('Match (CAP-09)').parentElement
    expect(matchSection).toBeTruthy()

    // Click a match row to reveal the scoring breakdown.
    fireEvent.click(within(matchSection as HTMLElement).getByText('1.000000'))
    expect(within(matchSection as HTMLElement).getByText('Scoring breakdown')).toBeTruthy()
    expect(within(matchSection as HTMLElement).getByText('x_ref')).toBeTruthy()
    expect(within(matchSection as HTMLElement).getByText('Δ')).toBeTruthy()
  })

  it('matches detected features to band/range annotations (CAP-09)', async () => {
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
            {
              id: 'ref-1',
              name: 'Band Reference',
              created_at: '2025-12-16T00:00:00Z',
              source_file_name: 'ref.jdx',
              sha256: 'r',
            },
          ],
        }
      }

      if (url.includes('/datasets/ds-1/data')) {
        return {
          ok: true,
          json: async () => ({ id: 'ds-1', x: [0, 1, 2, 3, 4], y: [0, 1, 0, 2, 0], x_unit: 'nm', y_unit: 'arb' }),
        }
      }

      if (url.includes('/datasets/ref-1/data')) {
        return {
          ok: true,
          json: async () => ({
            id: 'ref-1',
            x: [0, 1, 2],
            y: [0, 0, 0],
            x_unit: 'nm',
            y_unit: 'arb',
            reference: { data_type: 'Spectrum', source_name: 'Ref', citation_text: 'cite' },
          }),
        }
      }

      if (url.includes('/datasets/ref-1/annotations')) {
        return {
          ok: true,
          json: async () => [
            {
              annotation_id: 'a1',
              dataset_id: 'ref-1',
              type: 'range_x',
              text: 'Test band',
              author_user_id: 'local/anonymous',
              created_at: '2025-12-16T00:00:00Z',
              updated_at: '2025-12-16T00:00:00Z',
              x_unit: 'nm',
              y_unit: 'arb',
              x0: 0.5,
              x1: 1.5,
              y0: null,
              y1: null,
            },
          ],
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

    await screen.findByText('My dataset')
    fireEvent.click(screen.getByLabelText('Toggle My dataset'))

    fireEvent.click(screen.getByText('Run'))
    await screen.findByText('Results (2)')

    // Switch to band/range matching.
    fireEvent.change(screen.getByLabelText('Match reference type'), { target: { value: 'band-ranges' } })
    fireEvent.change(screen.getByLabelText('Match reference dataset'), { target: { value: 'ref-1' } })
    fireEvent.click(screen.getByText('Run match'))

    await screen.findByText('Apply top match labels to annotations')
    expect(screen.getAllByText(/Band:/i).length).toBeGreaterThan(0)
  })
})
