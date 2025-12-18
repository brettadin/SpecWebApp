declare module 'react-plotly.js' {
  import type * as React from 'react'

  export type PlotlyLayout = {
    shapes?: unknown[]
  } & Record<string, unknown>

  export type PlotParams = {
    data?: unknown
    layout?: PlotlyLayout
    config?: unknown
    frames?: unknown
    revision?: number
    onInitialized?: (...args: unknown[]) => void
    onUpdate?: (...args: unknown[]) => void
    onPurge?: (...args: unknown[]) => void
    onError?: (...args: unknown[]) => void
    onRelayout?: (...args: unknown[]) => void
    onClick?: (...args: unknown[]) => void
    style?: React.CSSProperties
    className?: string
    useResizeHandler?: boolean
    divId?: string
    debug?: boolean
  }

  const PlotlyComponent: React.ComponentType<PlotParams>
  export default PlotlyComponent
}
