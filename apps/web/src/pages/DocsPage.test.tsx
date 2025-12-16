import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DocsPage } from './DocsPage'

describe('DocsPage (CAP-14)', () => {
  it('prefills search from URL params', () => {
    render(
      <MemoryRouter initialEntries={['/docs?q=FITS']}>
        <DocsPage />
      </MemoryRouter>,
    )

    const input = screen.getByLabelText('Search docs') as HTMLInputElement
    expect(input.value).toBe('FITS')
  })

  it('filters pages by query', () => {
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Search docs'), { target: { value: 'A/B' } })

    expect(screen.getByRole('button', { name: /CAP-06/i })).toBeInTheDocument()
  })
})
