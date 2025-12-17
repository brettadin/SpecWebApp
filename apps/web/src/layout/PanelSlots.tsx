import { type ReactNode } from 'react'

import { PanelSlotsContext, type PanelSlots } from './panelSlotsContext'

export function PanelSlotsProvider({ value, children }: { value: PanelSlots; children: ReactNode }) {
  return <PanelSlotsContext.Provider value={value}>{children}</PanelSlotsContext.Provider>
}
