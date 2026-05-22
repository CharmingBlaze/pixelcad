export type ViewportLayoutMode = 'quad' | 'single' | 'splitVertical' | 'splitHorizontal' | 'uvEditor'

import { PERSP_VP_INDEX, SIDE_VP_INDEX } from './viewports'

const MIN_SPLIT = 0.18
const MAX_SPLIT = 0.82

function fallbackSecondaryViewport(primary: number): number {
  if (primary !== PERSP_VP_INDEX) return PERSP_VP_INDEX
  return 0
}

export const viewportLayout = $state({
  mode: 'quad' as ViewportLayoutMode,
  returnMode: 'quad' as ViewportLayoutMode,
  secondaryViewport: 1,
  quadSplitX: 0.5,
  quadSplitY: 0.5,
  splitX: 0.5,
  splitY: 0.5,
})

function clampSplit(value: number) {
  return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, value))
}

export function setViewportLayoutMode(mode: ViewportLayoutMode) {
  if (mode !== 'single') viewportLayout.returnMode = mode
  viewportLayout.mode = mode
}

export function applyViewportLayoutMode(mode: ViewportLayoutMode, activeViewport: number) {
  if (mode === 'splitVertical') {
    setSecondaryViewport(SIDE_VP_INDEX)
  } else if (mode !== 'quad') {
    setSecondaryViewport(fallbackSecondaryViewport(activeViewport))
  }
  setViewportLayoutMode(mode)
}

export function toggleViewportMaximize() {
  if (viewportLayout.mode === 'single') {
    viewportLayout.mode = viewportLayout.returnMode === 'single' ? 'quad' : viewportLayout.returnMode
  } else {
    viewportLayout.returnMode = viewportLayout.mode
    viewportLayout.mode = 'single'
  }
}

export function toggleUvEditor() {
  if (viewportLayout.mode === 'uvEditor') {
    viewportLayout.mode = viewportLayout.returnMode === 'uvEditor' ? 'quad' : viewportLayout.returnMode
    return
  }

  viewportLayout.returnMode = viewportLayout.mode
  viewportLayout.mode = 'uvEditor'
}

export function setSecondaryViewport(index: number) {
  viewportLayout.secondaryViewport = Math.max(0, Math.min(3, index))
}

export function setQuadSplit(axis: 'x' | 'y', value: number) {
  if (axis === 'x') viewportLayout.quadSplitX = clampSplit(value)
  else viewportLayout.quadSplitY = clampSplit(value)
}

export function setSplit(axis: 'x' | 'y', value: number) {
  if (axis === 'x') viewportLayout.splitX = clampSplit(value)
  else viewportLayout.splitY = clampSplit(value)
}
