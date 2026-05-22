import type { ActiveTool, EditMode, GizmoMode, PrimitiveType } from './types'
import type { ViewportLayoutMode } from './viewportLayout.svelte'

export interface ShortcutAction {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: string
  label: string
}

export const SHORTCUTS: ShortcutAction[] = [
  // Edit modes
  { key: '1', action: 'mode:object', label: 'Object mode' },
  { key: '2', action: 'mode:vertex', label: 'Vertex mode' },
  { key: '3', action: 'mode:edge', label: 'Edge mode' },
  { key: '4', action: 'mode:face', label: 'Face mode' },

  // Tools
  { key: 's', action: 'tool:select', label: 'Select tool' },
  { key: 'g', action: 'tool:grab', label: 'Grab tool' },
  { key: 'b', action: 'tool:bevel', label: 'Bevel tool' },
  { key: 'e', action: 'mesh:extrude', label: 'Extrude faces' },

  // Mesh edit
  { key: 'i', action: 'mesh:inset', label: 'Inset faces' },
  { key: 'f', action: 'mesh:fill', label: 'Fill edge loop' },
  { key: 'f', shift: true, action: 'mesh:flip', label: 'Flip face normals' },
  { key: '2', ctrl: true, action: 'mesh:subdivide', label: 'Subdivide' },
  { key: 'f', ctrl: true, action: 'mesh:fillHoles', label: 'Fill holes' },

  // Mirror
  { key: 'x', alt: true, action: 'mesh:mirrorX', label: 'Mirror X' },
  { key: 'y', alt: true, action: 'mesh:mirrorY', label: 'Mirror Y' },
  { key: 'z', alt: true, action: 'mesh:mirrorZ', label: 'Mirror Z' },

  // Selection
  { key: 'Delete', action: 'delete', label: 'Delete' },
  { key: 'x', action: 'delete', label: 'Delete' },
  { key: 'd', ctrl: true, action: 'duplicate', label: 'Duplicate' },
  { key: 'a', action: 'selectToggleAll', label: 'Select / deselect all' },
  { key: 'g', ctrl: true, action: 'selectGrow', label: 'Grow selection' },
  { key: 'i', ctrl: true, action: 'selectInvert', label: 'Invert selection' },

  // File
  { key: 'n', ctrl: true, action: 'newScene', label: 'New scene' },
  { key: 'o', ctrl: true, action: 'open', label: 'Open scene' },
  { key: 'i', ctrl: true, shift: true, action: 'import', label: 'Import mesh' },
  { key: 's', ctrl: true, action: 'save', label: 'Save scene' },
  { key: 'e', ctrl: true, shift: true, action: 'export:obj', label: 'Export OBJ' },

  // History
  { key: 'z', ctrl: true, action: 'undo', label: 'Undo' },
  { key: 'y', ctrl: true, action: 'redo', label: 'Redo' },
  { key: 'z', ctrl: true, shift: true, action: 'redo', label: 'Redo' },

  // View / layout
  { key: 'Tab', action: 'ui:toggleSidebars', label: 'Toggle side panels' },
  { key: ' ', action: 'viewport:maximize', label: 'Maximize viewport' },
  { key: '1', alt: true, action: 'view:quad', label: 'Quad view' },
  { key: '2', alt: true, action: 'view:splitVertical', label: 'Vertical split' },
  { key: '3', alt: true, action: 'view:splitHorizontal', label: 'Horizontal split' },
  { key: 'o', shift: true, action: 'view:outlines', label: 'Toggle outlines' },
  { key: 'n', shift: true, action: 'view:normals', label: 'Toggle matcap normals' },
  { key: 'z', shift: true, action: 'shading:wire', label: 'Wireframe shading' },
  { key: '1', shift: true, action: 'shading:solid', label: 'Solid shading' },

  // Gizmo / transform
  { key: 't', action: 'gizmo:translate', label: 'Move gizmo' },
  { key: 'r', action: 'gizmo:rotate', label: 'Rotate gizmo' },
  { key: 'l', action: 'gizmo:scale', label: 'Scale gizmo' },
  { key: '`', action: 'space:toggle', label: 'Toggle local/world space' },
  { key: '`', shift: true, action: 'ui:snapToggle', label: 'Toggle snap' },

  // Poly draw
  { key: '3', shift: true, action: 'poly:triangle', label: 'Triangle draw' },
  { key: '4', shift: true, action: 'poly:quad', label: 'Quad draw' },
  { key: '5', shift: true, action: 'poly:poly', label: 'Poly draw' },
  { key: 't', alt: true, action: 'poly:triangle', label: 'Triangle draw' },
  { key: 'q', alt: true, action: 'poly:quad', label: 'Quad draw' },
  { key: 'p', alt: true, action: 'poly:poly', label: 'Poly draw' },

  // Add primitives
  { key: 'b', ctrl: true, shift: true, action: 'add:box', label: 'Draw box' },
  { key: 'b', shift: true, action: 'add:box', label: 'Draw box' },
  { key: 's', ctrl: true, shift: true, action: 'add:sphere', label: 'Draw sphere' },
  { key: 'c', ctrl: true, shift: true, action: 'add:cylinder', label: 'Draw cylinder' },
  { key: 'o', ctrl: true, shift: true, action: 'add:cone', label: 'Draw cone' },
  { key: 'y', ctrl: true, shift: true, action: 'add:pyramid', label: 'Draw pyramid' },
  { key: 't', ctrl: true, shift: true, action: 'add:torus', label: 'Draw torus' },
  { key: 'p', ctrl: true, shift: true, action: 'add:plane', label: 'Draw plane' },
  { key: 'p', ctrl: true, action: 'add:plane', label: 'Draw plane' },

  // UV projection
  { key: 'u', ctrl: true, shift: true, action: 'uv:projectX', label: 'Project UV X' },
  { key: 'v', ctrl: true, shift: true, action: 'uv:projectY', label: 'Project UV Y' },
  { key: 'w', ctrl: true, shift: true, action: 'uv:projectZ', label: 'Project UV Z' },
]

const actionToShortcuts = new Map<string, ShortcutAction[]>()
for (const sc of SHORTCUTS) {
  const list = actionToShortcuts.get(sc.action) ?? []
  list.push(sc)
  actionToShortcuts.set(sc.action, list)
}

export function formatShortcut(sc: ShortcutAction): string {
  const parts: string[] = []
  if (sc.ctrl) parts.push('Ctrl')
  if (sc.shift) parts.push('Shift')
  if (sc.alt) parts.push('Alt')
  const key =
    sc.key === ' ' ? 'Space' : sc.key.length === 1 ? sc.key.toUpperCase() : sc.key
  parts.push(key)
  return parts.join('+')
}

export function shortcutLabel(action: string): string | null {
  const list = actionToShortcuts.get(action)
  if (!list?.length) return null
  return formatShortcut(list[0])
}

export function shortcutLabelsAll(action: string): string | null {
  const list = actionToShortcuts.get(action)
  if (!list?.length) return null
  const labels = list.map(formatShortcut)
  return labels.length > 1 ? labels.join(' / ') : labels[0]
}

export function shortcutHint(label: string, action: string): string {
  const sc = shortcutLabelsAll(action) ?? shortcutLabel(action)
  return sc ? `${label} (${sc})` : label
}

export function matchShortcut(e: KeyboardEvent): string | null {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return null
  }

  for (const sc of SHORTCUTS) {
    if (e.key.toLowerCase() !== sc.key.toLowerCase() && e.key !== sc.key) continue
    if (!!sc.ctrl !== (e.ctrlKey || e.metaKey)) continue
    if (!!sc.shift !== e.shiftKey) continue
    if (!!sc.alt !== e.altKey) continue
    return sc.action
  }
  return null
}

export function parseModeAction(action: string): EditMode | null {
  if (action === 'mode:object') return 'object'
  if (action === 'mode:vertex') return 'vertex'
  if (action === 'mode:edge') return 'edge'
  if (action === 'mode:face') return 'face'
  return null
}

export function parseGizmoAction(action: string): GizmoMode | null {
  if (action === 'gizmo:translate') return 'translate'
  if (action === 'gizmo:rotate') return 'rotate'
  if (action === 'gizmo:scale') return 'scale'
  return null
}

export function parseToolAction(action: string): ActiveTool | null {
  if (action === 'tool:grab') return 'grab'
  if (action === 'tool:select') return 'select'
  if (action === 'tool:extrudeface') return 'extrudeface'
  if (action === 'tool:bevel') return 'bevel'
  return null
}

export function parseMirrorAction(action: string): 'x' | 'y' | 'z' | null {
  if (action === 'mesh:mirrorX') return 'x'
  if (action === 'mesh:mirrorY') return 'y'
  if (action === 'mesh:mirrorZ') return 'z'
  return null
}

const ADD_ACTIONS: Record<string, PrimitiveType> = {
  'add:box': 'box',
  'add:sphere': 'sphere',
  'add:cylinder': 'cylinder',
  'add:cone': 'cone',
  'add:pyramid': 'pyramid',
  'add:torus': 'torus',
  'add:plane': 'plane',
}

export function parseAddAction(action: string): PrimitiveType | null {
  return ADD_ACTIONS[action] ?? null
}

export function parsePolyAction(action: string): 'triangle' | 'quad' | 'poly' | null {
  if (action === 'poly:triangle') return 'triangle'
  if (action === 'poly:quad') return 'quad'
  if (action === 'poly:poly') return 'poly'
  return null
}

export function parseViewLayoutAction(action: string): ViewportLayoutMode | null {
  if (action === 'view:quad') return 'quad'
  if (action === 'view:splitVertical') return 'splitVertical'
  if (action === 'view:splitHorizontal') return 'splitHorizontal'
  return null
}

export function parseUvAction(action: string): 'x' | 'y' | 'z' | null {
  if (action === 'uv:projectX') return 'x'
  if (action === 'uv:projectY') return 'y'
  if (action === 'uv:projectZ') return 'z'
  return null
}
