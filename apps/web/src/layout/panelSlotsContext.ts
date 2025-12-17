import { createContext, useContext } from 'react'

export type PanelSlots = {
  rightSlot: HTMLElement | null
}

export const PanelSlotsContext = createContext<PanelSlots | null>(null)

export function usePanelSlots() {
  return useContext(PanelSlotsContext)
}
