import {
  Box3,
  Vector2,
  Vector3,
  type Camera,
  type Mesh,
} from 'three'
import {
  cadState,
  getSelected,
  selectObject,
} from './cadState.svelte'
import { coplanarFaceGroup, selectableEdges } from './selectionGeometry'

export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

const worldPoint = new Vector3()
const projected = new Vector3()

export function marqueeSelect(
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
  additive = false,
) {
  const normalized = normalizeRect(rect)
  if (cadState.editMode === 'object') {
    marqueeSelectObject(camera, viewportElement, normalized, additive)
    return
  }

  const selected = getSelected()
  if (!selected) return
  if (cadState.editMode === 'vertex') marqueeSelectVertices(selected.mesh, camera, viewportElement, normalized, additive)
  else if (cadState.editMode === 'edge') marqueeSelectEdges(selected.mesh, camera, viewportElement, normalized, additive)
  else if (cadState.editMode === 'face') marqueeSelectFaces(selected.mesh, camera, viewportElement, normalized, additive)
  cadState.revision++
}

function marqueeSelectObject(
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
  additive: boolean,
) {
  const hits = cadState.objects.filter((obj) => {
    if (!obj.node.visible || obj.node.locked) return false
    return projectedObjectIntersects(obj.mesh, camera, viewportElement, rect)
  })

  if (hits.length > 0) {
    selectObject(hits[0].id)
  } else if (!additive) {
    selectObject(null)
  }
}

function marqueeSelectVertices(
  mesh: Mesh,
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
  additive: boolean,
) {
  const pos = mesh.geometry.attributes.position
  if (!pos) return

  const next = additive ? new Set(cadState.selVerts) : new Set<number>()
  for (let i = 0; i < pos.count; i++) {
    worldPoint.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    mesh.localToWorld(worldPoint)
    const screen = projectToViewport(worldPoint, camera, viewportElement)
    if (screen && pointInRect(screen, rect)) next.add(i)
  }
  cadState.selVerts = next
}

function marqueeSelectEdges(
  mesh: Mesh,
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
  additive: boolean,
) {
  const pos = mesh.geometry.attributes.position
  if (!pos) return

  const next = additive ? new Set(cadState.selEdges) : new Set<string>()
  for (const edge of selectableEdges(mesh)) {
    const a = projectedVertex(mesh, edge.a, camera, viewportElement)
    const b = projectedVertex(mesh, edge.b, camera, viewportElement)
    if (!a || !b) continue
    if (segmentTouchesRect(a, b, rect)) next.add(edge.id)
  }
  cadState.selEdges = next
}

function marqueeSelectFaces(
  mesh: Mesh,
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
  additive: boolean,
) {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos || !idx) return

  const next = additive ? new Set(cadState.selFaces) : new Set<number>()
  const index = idx.array
  for (let i = 0; i < index.length; i += 3) {
    const centroid = new Vector3()
    for (let n = 0; n < 3; n++) {
      const vi = index[i + n]
      centroid.add(new Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi)))
    }
    centroid.multiplyScalar(1 / 3)
    mesh.localToWorld(centroid)
    const screen = projectToViewport(centroid, camera, viewportElement)
    if (!screen || !pointInRect(screen, rect)) continue
    coplanarFaceGroup(mesh, i / 3).forEach((face) => next.add(face))
  }
  cadState.selFaces = next
}

function projectedObjectIntersects(
  mesh: Mesh,
  camera: Camera,
  viewportElement: HTMLElement,
  rect: ScreenRect,
): boolean {
  mesh.updateWorldMatrix(true, false)
  const box = new Box3().setFromObject(mesh)
  if (box.isEmpty()) {
    const center = mesh.getWorldPosition(new Vector3())
    const screen = projectToViewport(center, camera, viewportElement)
    return !!screen && pointInRect(screen, rect)
  }

  const points = [
    new Vector3(box.min.x, box.min.y, box.min.z),
    new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.min.z),
    new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.min.z),
    new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.min.z),
    new Vector3(box.max.x, box.max.y, box.max.z),
  ]
  return points.some((point) => {
    const screen = projectToViewport(point, camera, viewportElement)
    return !!screen && pointInRect(screen, rect)
  })
}

function projectedVertex(
  mesh: Mesh,
  index: number,
  camera: Camera,
  viewportElement: HTMLElement,
): Vector2 | null {
  const pos = mesh.geometry.attributes.position
  if (!pos) return null
  worldPoint.set(pos.getX(index), pos.getY(index), pos.getZ(index))
  mesh.localToWorld(worldPoint)
  return projectToViewport(worldPoint, camera, viewportElement)
}

function projectToViewport(
  world: Vector3,
  camera: Camera,
  viewportElement: HTMLElement,
): Vector2 | null {
  const rect = viewportElement.getBoundingClientRect()
  projected.copy(world).project(camera)
  if (projected.z < -1 || projected.z > 1) return null
  return new Vector2(
    ((projected.x + 1) / 2) * rect.width,
    ((-projected.y + 1) / 2) * rect.height,
  )
}

function normalizeRect(rect: ScreenRect): ScreenRect {
  return {
    left: Math.min(rect.left, rect.right),
    top: Math.min(rect.top, rect.bottom),
    right: Math.max(rect.left, rect.right),
    bottom: Math.max(rect.top, rect.bottom),
  }
}

function pointInRect(point: Vector2, rect: ScreenRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

function segmentTouchesRect(a: Vector2, b: Vector2, rect: ScreenRect): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true
  const corners = [
    new Vector2(rect.left, rect.top),
    new Vector2(rect.right, rect.top),
    new Vector2(rect.right, rect.bottom),
    new Vector2(rect.left, rect.bottom),
  ]
  return corners.some((corner, i) =>
    segmentsIntersect(a, b, corner, corners[(i + 1) % corners.length]),
  )
}

function segmentsIntersect(a: Vector2, b: Vector2, c: Vector2, d: Vector2): boolean {
  const ab = orientation(a, b, c) * orientation(a, b, d)
  const cd = orientation(c, d, a) * orientation(c, d, b)
  return ab <= 0 && cd <= 0
}

function orientation(a: Vector2, b: Vector2, c: Vector2): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
}
