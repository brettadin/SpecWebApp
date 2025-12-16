import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
	cleanup()
})

// Plotly uses canvas internally; jsdom's canvas stub throws "Not implemented".
// Override it to avoid noisy warnings during unit tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
HTMLCanvasElement.prototype.getContext = (() => null) as any
