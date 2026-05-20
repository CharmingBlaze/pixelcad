import {
  Mesh,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type Object3D,
} from 'three'
import {
  cadState,
  clearSubHover,
  getSelected,
  deselectAllSub,
  pickEdge,
  pickFace,
  pickVert,
  selectObject,
  setSubHover,
} from './cadState.svelte'
import { edgeId, selectableEdges } from './selectionGeometry'

const raycaster = new Raycaster()
raycaster.params.Line = { threshold: 0.05 }
raycaster.params.Points = { threshold: 0.05 }
const VERTEX_HOVER_RADIUS_PX = 12

type SubHit = {
  vertIdx?: number
  faceIdx?: number
  edgeId?: string
}

export function pickAt(
  camera: Camera,
  vpElement: HTMLElement,
  clientX: number,
  clientY: number,
  meshes: Object3D[],
  subHelpers: Object3D[],
  additive = false,
) {
  raycastAt(camera, vpElement, clientX, clientY)

  if (cadState.editMode === 'object') {
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length > 0) {
      const hit = hits[0].object
      const obj = cadState.objects.find((o) => o.mesh === hit)
      selectObject(obj?.id ?? null)
    } else {
      selectObject(null)
    }
    return
  }

  const hit = hitSubHelper(subHelpers)
  const geometryHit = hit ?? hitSelectedGeometry()
  if (geometryHit?.vertIdx !== undefined) pickVert(geometryHit.vertIdx, additive)
  else if (geometryHit?.faceIdx !== undefined) pickFace(geometryHit.faceIdx, additive)
  else if (geometryHit?.edgeId) pickEdge(geometryHit.edgeId, additive)
  else if (!additive) deselectAllSub()
}

export function hoverAt(
  camera: Camera,
  vpElement: HTMLElement,
  clientX: number,
  clientY: number,
  subHelpers: Object3D[],
) {
  if (cadState.editMode === 'object') {
    clearSubHover()
    return
  }
  raycastAt(camera, vpElement, clientX, clientY)
  const hit =
    hitSubHelper(subHelpers) ??
    (cadState.editMode === 'vertex'
      ? hitVertexScreenSpace(camera, vpElement, clientX, clientY)
      : hitSelectedGeometry())
  if (hit?.vertIdx !== undefined) setSubHover({ vert: hit.vertIdx })
  else if (hit?.edgeId) setSubHover({ edge: hit.edgeId })
  else if (hit?.faceIdx !== undefined) setSubHover({ face: hit.faceIdx })
  else clearSubHover()
}

function raycastAt(camera: Camera, vpElement: HTMLElement, clientX: number, clientY: number) {
  const rect = vpElement.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  const nx = (localX / rect.width) * 2 - 1
  const ny = -(localY / rect.height) * 2 + 1
  const mouse = new Vector2(nx, ny)
  raycaster.setFromCamera(mouse, camera)
}

function hitSubHelper(subHelpers: Object3D[]): SubHit | null {
  if (cadState.editMode === 'vertex' || cadState.editMode === 'face') {
    const targets = subHelpers.filter((h) => {
      const data = (h as { userData?: { vertIdx?: number; faceIdx?: number } }).userData
      return cadState.editMode === 'vertex' ? data?.vertIdx !== undefined : data?.faceIdx !== undefined
    })
    const hits = raycaster.intersectObjects(targets, false)
    if (hits.length > 0) {
      return (hits[0].object as { userData: { vertIdx?: number; faceIdx?: number } }).userData
    }
    return null
  }

  if (cadState.editMode === 'edge') {
    const edgeMeshes = subHelpers.filter((h) => (h as { userData?: { edgeId?: string } }).userData?.edgeId)
    const hits = raycaster.intersectObjects(edgeMeshes, false)
    if (hits.length > 0) {
      return (hits[0].object as { userData: { edgeId?: string } }).userData
    }
  }
  return null
}

function hitVertexScreenSpace(
  camera: Camera,
  vpElement: HTMLElement,
  clientX: number,
  clientY: number,
): SubHit | null {
  const mesh = getSelected()?.mesh
  const pos = mesh?.geometry.attributes.position
  if (!mesh || !pos) return null

  const rect = vpElement.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null

  mesh.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()

  const projected = new Vector3()
  let bestIndex = -1
  let bestDistanceSq = VERTEX_HOVER_RADIUS_PX * VERTEX_HOVER_RADIUS_PX

  for (let i = 0; i < pos.count; i++) {
    projected.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    mesh.localToWorld(projected)
    projected.project(camera)
    if (projected.z < -1 || projected.z > 1) continue

    const x = ((projected.x + 1) / 2) * rect.width
    const y = ((1 - projected.y) / 2) * rect.height
    const dx = x - localX
    const dy = y - localY
    const distanceSq = dx * dx + dy * dy
    if (distanceSq < bestDistanceSq) {
      bestIndex = i
      bestDistanceSq = distanceSq
    }
  }

  return bestIndex >= 0 ? { vertIdx: bestIndex } : null
}

function hitSelectedGeometry(): SubHit | null {
  const mesh = getSelected()?.mesh
  if (!mesh) return null

  const hits = raycaster.intersectObject(mesh, false)
  if (hits.length === 0) return null
  const hit = hits[0] as Intersection<Mesh>
  const faceIndex = hit.faceIndex
  if (faceIndex === undefined || faceIndex === null || faceIndex < 0) return null

  if (cadState.editMode === 'face') return { faceIdx: faceIndex }

  const face = faceVertexIndices(mesh, faceIndex)
  if (!face) return null

  if (cadState.editMode === 'vertex') {
    return { vertIdx: nearestFaceVertex(mesh, hit, face) }
  }

  if (cadState.editMode === 'edge') {
    const [a, b] = nearestFaceEdge(mesh, hit, face)
    return { edgeId: edgeId(a, b) }
  }

  return null
}

function faceVertexIndices(mesh: Mesh, faceIndex: number): [number, number, number] | null {
  const pos = mesh.geometry.attributes.position
  if (!pos) return null

  const index = mesh.geometry.index
  if (index) {
    const i = faceIndex * 3
    return [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
  }

  const base = faceIndex * 3
  if (base + 2 >= pos.count) return null
  return [base, base + 1, base + 2]
}

function nearestFaceVertex(mesh: Mesh, hit: Intersection, face: [number, number, number]): number {
  const localPoint = mesh.worldToLocal(hit.point.clone())
  const pos = mesh.geometry.attributes.position
  let best = face[0]
  let bestDistance = Infinity

  for (const vi of face) {
    const p = new Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi))
    const distance = p.distanceToSquared(localPoint)
    if (distance < bestDistance) {
      best = vi
      bestDistance = distance
    }
  }

  return best
}

function nearestFaceEdge(
  mesh: Mesh,
  hit: Intersection,
  face: [number, number, number],
): [number, number] {
  const localPoint = mesh.worldToLocal(hit.point.clone())
  const facePairs: [number, number][] = [
    [face[0], face[1]],
    [face[1], face[2]],
    [face[2], face[0]],
  ]
  const selectableIds = new Set(selectableEdges(mesh).map((edge) => edge.id))
  const pairs = facePairs.filter(([a, b]) => selectableIds.has(edgeId(a, b)))
  if (pairs.length === 0) return [face[0], face[1]]
  const pos = mesh.geometry.attributes.position
  let best = pairs[0]
  let bestDistance = Infinity

  for (const pair of pairs) {
    const a = new Vector3(pos.getX(pair[0]), pos.getY(pair[0]), pos.getZ(pair[0]))
    const b = new Vector3(pos.getX(pair[1]), pos.getY(pair[1]), pos.getZ(pair[1]))
    const distance = distancePointToSegmentSquared(localPoint, a, b)
    if (distance < bestDistance) {
      best = pair
      bestDistance = distance
    }
  }

  return best
}

function distancePointToSegmentSquared(point: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a)
  const lengthSq = ab.lengthSq()
  if (lengthSq <= 0.0000001) return point.distanceToSquared(a)
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / lengthSq))
  return point.distanceToSquared(a.add(ab.multiplyScalar(t)))
}

export function getSelectedMesh() {
  return getSelected()?.mesh ?? null
}
