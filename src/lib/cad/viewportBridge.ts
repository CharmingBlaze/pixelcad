import type { Camera } from 'three'

export interface ViewportBridge {
  getActiveCamera: () => Camera
  getActiveViewportRect: () => DOMRect
  setGizmoDragging: (dragging: boolean) => void
  isGizmoDragging: () => boolean
}

let bridge: ViewportBridge | null = null

export function registerViewportBridge(b: ViewportBridge | null) {
  bridge = b
}

export function getViewportBridge(): ViewportBridge | null {
  return bridge
}
