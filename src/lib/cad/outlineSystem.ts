import {
  BufferGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  type Material,
  type Mesh,
} from 'three'

const DEFAULT_THRESHOLD_ANGLE = 15
const OUTLINE_COLOR = 0x111111
const SELECTED_OUTLINE_COLOR = 0x111111
const SELECTION_HIGHLIGHT_COLOR = 0x66ccff
const SELECTION_HIGHLIGHT_OPACITY = 0.38
const SELECTION_HIGHLIGHT_SCALE = 1.002

export interface MeshOutline {
  lines: LineSegments
  thresholdAngle: number
}

interface OutlineState {
  visible?: boolean
  selected?: boolean
  selectionHighlight?: boolean
}

function selectionHighlightMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({
    color: SELECTION_HIGHLIGHT_COLOR,
    transparent: true,
    opacity: SELECTION_HIGHLIGHT_OPACITY,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  })
}

function storedSelectionHighlight(mesh: Mesh): LineSegments | null {
  const highlight = mesh.userData.selectionHighlight as LineSegments | undefined
  return highlight instanceof LineSegments ? highlight : null
}

export function disposeSelectionHighlight(mesh: Mesh): void {
  const highlight = storedSelectionHighlight(mesh)
  if (!highlight) {
    mesh.userData.selectionHighlight = null
    return
  }

  mesh.remove(highlight)
  highlight.geometry.dispose()
  disposeMaterial(highlight.material)
  mesh.userData.selectionHighlight = null
}

function rebuildSelectionHighlight(mesh: Mesh): LineSegments | null {
  disposeSelectionHighlight(mesh)

  if (!(mesh.geometry instanceof BufferGeometry) || !mesh.geometry.attributes.position) {
    return null
  }

  const geometry = new EdgesGeometry(mesh.geometry, DEFAULT_THRESHOLD_ANGLE)
  const lines = new LineSegments(geometry, selectionHighlightMaterial())
  lines.name = 'Selection Highlight'
  lines.renderOrder = 4
  lines.scale.setScalar(SELECTION_HIGHLIGHT_SCALE)
  lines.visible = false
  mesh.add(lines)
  mesh.userData.selectionHighlight = lines
  return lines
}

function ensureSelectionHighlight(mesh: Mesh): LineSegments | null {
  return storedSelectionHighlight(mesh) ?? rebuildSelectionHighlight(mesh)
}

function lineMaterial(color = OUTLINE_COLOR): LineBasicMaterial {
  return new LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  })
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((mat) => mat.dispose())
  } else {
    material.dispose()
  }
}

function storedOutline(mesh: Mesh): MeshOutline | null {
  const outline = mesh.userData.outline as MeshOutline | undefined
  if (outline?.lines instanceof LineSegments) return outline

  const wireEdges = mesh.userData.wireEdges as LineSegments | undefined
  if (wireEdges instanceof LineSegments) {
    return { lines: wireEdges, thresholdAngle: DEFAULT_THRESHOLD_ANGLE }
  }

  return null
}

export function getMeshOutline(mesh: Mesh): LineSegments | null {
  return storedOutline(mesh)?.lines ?? null
}

export function disposeMeshOutline(mesh: Mesh): void {
  const outline = storedOutline(mesh)
  if (!outline) {
    mesh.userData.outline = null
    mesh.userData.wireEdges = null
    disposeSelectionHighlight(mesh)
    return
  }

  mesh.remove(outline.lines)
  outline.lines.geometry.dispose()
  disposeMaterial(outline.lines.material)
  mesh.userData.outline = null
  mesh.userData.wireEdges = null
  disposeSelectionHighlight(mesh)
}

export function rebuildMeshOutline(
  mesh: Mesh,
  thresholdAngle = DEFAULT_THRESHOLD_ANGLE,
): LineSegments | null {
  disposeMeshOutline(mesh)

  if (!(mesh.geometry instanceof BufferGeometry) || !mesh.geometry.attributes.position) {
    return null
  }

  const geometry = new EdgesGeometry(mesh.geometry, thresholdAngle)
  const lines = new LineSegments(geometry, lineMaterial())
  lines.name = 'CAD Managed Outline'
  lines.renderOrder = 2
  lines.userData.managedOutline = true

  mesh.add(lines)
  mesh.userData.outline = { lines, thresholdAngle } satisfies MeshOutline
  // Compatibility with older code paths while the outline system becomes the single source.
  mesh.userData.wireEdges = lines

  rebuildSelectionHighlight(mesh)

  return lines
}

export function ensureMeshOutline(mesh: Mesh): LineSegments | null {
  return getMeshOutline(mesh) ?? rebuildMeshOutline(mesh)
}

export function setMeshOutlineState(mesh: Mesh, state: OutlineState): void {
  const lines = ensureMeshOutline(mesh)
  if (lines) {
    if (state.visible !== undefined) lines.visible = state.visible

    const material = Array.isArray(lines.material) ? lines.material[0] : lines.material
    if (material instanceof LineBasicMaterial) {
      material.color.setHex(state.selected ? SELECTED_OUTLINE_COLOR : OUTLINE_COLOR)
    }
  }

  const highlight = ensureSelectionHighlight(mesh)
  if (highlight && state.selectionHighlight !== undefined) {
    highlight.visible = state.selectionHighlight
  }
}
