import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App navigation', () => {
  it('renders required nav test ids', () => {
    render(
      <MemoryRouter initialEntries={['/plot']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('nav-library')).toBeInTheDocument()
    expect(screen.getByTestId('nav-plot')).toBeInTheDocument()
    expect(screen.getByTestId('nav-notebook')).toBeInTheDocument()
    expect(screen.getByTestId('nav-docs')).toBeInTheDocument()
  })

  it('renders a route page', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
  })
})
