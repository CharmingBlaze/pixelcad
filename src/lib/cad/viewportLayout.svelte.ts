export type ViewportLayoutMode = 'quad' | 'single' | 'splitVertical' | 'splitHorizontal' | 'uvEditor'

const MIN_SPLIT = 0.18
const MAX_SPLIT = 0.82

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

export function toggleViewportMaximize() {
  if (viewportLayout.mode === 'single') {
    viewportLayout.mode = viewportLayout.returnMode === 'single' ? 'quad' : viewportLayout.returnMode
  } else {
    viewportLayout.returnMode = viewportLayout.mode
    viewportLayout.mode = 'single'
  }
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
