import { Float32BufferAttribute, Mesh, Vector2, Vector3 } from 'three'
import { coplanarFaceGroup } from './selectionGeometry'

const UV_ISLAND_CREASE_DEG = 45

export type UvPoint = {
  vertexIndex: number
  uv: Vector2
}

export type UvFaceIsland = {
  faceIndices: number[]
  points: UvPoint[]
}

export function prepareUvIsland(mesh: Mesh, faceSelection: Set<number>): boolean {
  const indices = selectedFaceIndices(mesh, expandFaceSelectionForUv(mesh, faceSelection))
  if (indices.length === 0) return false

  ensureUvAttribute(mesh)
  const key = islandStorageKey(indices)
  const initialized = getInitializedIslands(mesh)
  if (initialized.has(key)) return false

  const geometryChanged = splitIslandUvVertices(mesh, indices)
  const ordered = orderedBoundaryVertices(mesh, indices)
  if (ordered.length >= 3 && !restoreIslandUvSnapshot(mesh, indices)) {
    normalizeDegenerateIslandUv(mesh, ordered, nextIslandSlot(mesh))
  }
  saveIslandUvSnapshot(mesh, indices)

  initialized.add(key)
  return geometryChanged
}

export function islandKeyForSelection(mesh: Mesh, faceSelection: Set<number> | number[]): string {
  const set = faceSelection instanceof Set ? faceSelection : new Set(faceSelection)
  const indices = selectedFaceIndices(mesh, expandFaceSelectionForUv(mesh, set))
  return islandStorageKey(indices)
}

export function syncSelectedUvIsland(mesh: Mesh, faceSelection: Set<number>): boolean {
  const indices = selectedFaceIndices(mesh, expandFaceSelectionForUv(mesh, faceSelection))
  if (indices.length === 0) return false

  ensureUvAttribute(mesh)
  const key = islandStorageKey(indices)
  if (!getInitializedIslands(mesh).has(key)) return false

  return restoreIslandUvSnapshot(mesh, indices)
}

export function getUvIsland(mesh: Mesh, faceSelection: Set<number>): UvFaceIsland | null {
  const indices = selectedFaceIndices(mesh, expandFaceSelectionForUv(mesh, faceSelection))
  if (indices.length === 0) return null

  ensureUvAttribute(mesh)

  const ordered = orderedBoundaryVertices(mesh, indices)
  if (ordered.length < 3) return null

  const uv = mesh.geometry.attributes.uv
  return {
    faceIndices: indices,
    points: ordered.map((vertexIndex) => ({
      vertexIndex,
      uv: new Vector2(uv.getX(vertexIndex), uv.getY(vertexIndex)),
    })),
  }
}

export function saveIslandUvSnapshot(mesh: Mesh, faceIndices: number[]) {
  const indices = selectedFaceIndices(mesh, expandFaceSelectionForUv(mesh, new Set(faceIndices)))
  if (indices.length === 0) return

  ensureUvAttribute(mesh)
  const key = islandStorageKey(indices)
  const ordered = orderedBoundaryVertices(mesh, indices)
  const uv = mesh.geometry.attributes.uv
  const snapshot: Record<string, [number, number]> = {}
  for (const vertexIndex of ordered) {
    snapshot[String(vertexIndex)] = [uv.getX(vertexIndex), uv.getY(vertexIndex)]
  }
  getIslandSnapshots(mesh)[key] = snapshot
}

/** @deprecated Use prepareUvIsland + getUvIsland */
export function selectedUvIsland(mesh: Mesh, faceSelection: Set<number>): UvFaceIsland | null {
  prepareUvIsland(mesh, faceSelection)
  return getUvIsland(mesh, faceSelection)
}

function expandFaceSelectionForUv(mesh: Mesh, faceSelection: Set<number>): Set<number> {
  const expanded = new Set<number>()
  for (const faceIndex of faceSelection) {
    for (const face of coplanarFaceGroup(mesh, faceIndex, UV_ISLAND_CREASE_DEG)) {
      expanded.add(face)
    }
  }
  return expanded
}

export function setVertexUv(mesh: Mesh, vertexIndex: number, u: number, v: number) {
  ensureUvAttribute(mesh)
  const uv = mesh.geometry.attributes.uv
  uv.setXY(vertexIndex, clamp01(u), clamp01(v))
  uv.needsUpdate = true
}

export function moveIslandUv(mesh: Mesh, island: UvFaceIsland, deltaU: number, deltaV: number) {
  ensureUvAttribute(mesh)
  const uv = mesh.geometry.attributes.uv
  for (const point of island.points) {
    uv.setXY(
      point.vertexIndex,
      clamp01(point.uv.x + deltaU),
      clamp01(point.uv.y + deltaV),
    )
  }
  uv.needsUpdate = true
}

export function ensureUvAttribute(mesh: Mesh) {
  if (mesh.geometry.attributes.uv) return

  const pos = mesh.geometry.attributes.position
  const uvs: number[] = []
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  const size = box?.getSize(new Vector3()) ?? new Vector3(1, 1, 1)
  const min = box?.min ?? new Vector3()
  const spanX = Math.max(size.x, 0.0001)
  const spanY = Math.max(size.y, 0.0001)
  const spanZ = Math.max(size.z, 0.0001)

  const useXZ = size.x >= size.y || size.z >= size.y
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - min.x) / spanX
    const v = useXZ ? (pos.getZ(i) - min.z) / spanZ : (pos.getY(i) - min.y) / spanY
    uvs.push(clamp01(u), clamp01(v))
  }

  mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
}

function splitIslandUvVertices(mesh: Mesh, faceIndices: number[]): boolean {
  const islandFaceSet = new Set(faceIndices)
  const idx = mesh.geometry.index
  const pos = mesh.geometry.attributes.position
  if (!idx || !pos) return false

  const indexArray = Array.from(idx.array as ArrayLike<number>)
  const islandVertices = new Set<number>()

  for (let i = 0; i < indexArray.length; i += 3) {
    if (!islandFaceSet.has(i / 3)) continue
    islandVertices.add(indexArray[i])
    islandVertices.add(indexArray[i + 1])
    islandVertices.add(indexArray[i + 2])
  }

  if (islandVertices.size === 0) return false

  ensureUvAttribute(mesh)
  const uvAttr = mesh.geometry.attributes.uv
  const posArray = Array.from(pos.array as Float32Array)
  const uvArray = Array.from(uvAttr.array as Float32Array)
  const remap = new Map<number, number>()

  for (const vertexIndex of islandVertices) {
    const nextIndex = posArray.length / 3
    posArray.push(pos.getX(vertexIndex), pos.getY(vertexIndex), pos.getZ(vertexIndex))
    uvArray.push(uvAttr.getX(vertexIndex), uvAttr.getY(vertexIndex))
    remap.set(vertexIndex, nextIndex)
  }

  for (let i = 0; i < indexArray.length; i += 3) {
    if (!islandFaceSet.has(i / 3)) continue
    for (let j = 0; j < 3; j++) {
      const mapped = remap.get(indexArray[i + j])
      if (mapped !== undefined) indexArray[i + j] = mapped
    }
  }

  mesh.geometry.setAttribute('position', new Float32BufferAttribute(posArray, 3))
  mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2))
  mesh.geometry.setIndex(indexArray)
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
  return true
}

function restoreIslandUvSnapshot(mesh: Mesh, faceIndices: number[]): boolean {
  const key = islandStorageKey(faceIndices)
  const snapshot = getIslandSnapshots(mesh)[key]
  if (!snapshot) return false

  ensureUvAttribute(mesh)
  const uv = mesh.geometry.attributes.uv
  for (const [vertexKey, coords] of Object.entries(snapshot)) {
    const vertexIndex = Number(vertexKey)
    if (!Number.isFinite(vertexIndex) || vertexIndex < 0 || vertexIndex >= uv.count) continue
    uv.setXY(vertexIndex, coords[0], coords[1])
  }
  uv.needsUpdate = true
  return true
}

function getIslandSnapshots(mesh: Mesh): Record<string, Record<string, [number, number]>> {
  if (!mesh.userData.uvIslandSnapshots || typeof mesh.userData.uvIslandSnapshots !== 'object') {
    mesh.userData.uvIslandSnapshots = {}
  }
  return mesh.userData.uvIslandSnapshots as Record<string, Record<string, [number, number]>>
}

function normalizeDegenerateIslandUv(mesh: Mesh, vertices: number[], islandSlot: number) {
  const uv = mesh.geometry.attributes.uv
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity

  for (const vertex of vertices) {
    const u = uv.getX(vertex)
    const v = uv.getY(vertex)
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }

  const hasArea = maxU - minU > 0.05 && maxV - minV > 0.05
  const uniqueUvPoints = new Set(
    vertices.map((vertex) => `${uv.getX(vertex).toFixed(4)}:${uv.getY(vertex).toFixed(4)}`),
  )
  if (hasArea && uniqueUvPoints.size === vertices.length) return

  const defaults = defaultIslandUvs(vertices.length, islandSlot)
  vertices.forEach((vertex, index) => uv.setXY(vertex, defaults[index].x, defaults[index].y))
  uv.needsUpdate = true
}

function defaultIslandUvs(count: number, islandSlot: number): Vector2[] {
  const col = islandSlot % 3
  const row = Math.floor(islandSlot / 3)
  const offsetU = col * 0.3
  const offsetV = row * 0.3
  const scale = 0.22

  if (count === 3) {
    return [
      new Vector2(offsetU + scale * 0.5, offsetV + scale * 1),
      new Vector2(offsetU, offsetV),
      new Vector2(offsetU + scale, offsetV),
    ].map((point) => new Vector2(clamp01(point.x), clamp01(point.y)))
  }

  if (count === 4) {
    return [
      new Vector2(offsetU, offsetV + scale),
      new Vector2(offsetU, offsetV),
      new Vector2(offsetU + scale, offsetV),
      new Vector2(offsetU + scale, offsetV + scale),
    ].map((point) => new Vector2(clamp01(point.x), clamp01(point.y)))
  }

  const points: Vector2[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count
    points.push(
      new Vector2(
        clamp01(offsetU + scale * 0.5 + Math.cos(angle) * scale * 0.45),
        clamp01(offsetV + scale * 0.5 - Math.sin(angle) * scale * 0.45),
      ),
    )
  }
  return points
}

function islandStorageKey(faceIndices: number[]): string {
  return faceIndices.slice().sort((a, b) => a - b).join(',')
}

function getInitializedIslands(mesh: Mesh): Set<string> {
  if (!(mesh.userData.uvInitializedIslands instanceof Set)) {
    mesh.userData.uvInitializedIslands = new Set<string>()
  }
  return mesh.userData.uvInitializedIslands as Set<string>
}

function nextIslandSlot(mesh: Mesh): number {
  const slot = typeof mesh.userData.uvIslandSlotCount === 'number' ? mesh.userData.uvIslandSlotCount : 0
  mesh.userData.uvIslandSlotCount = slot + 1
  return slot
}

function selectedFaceIndices(mesh: Mesh, faceSelection: Set<number>): number[] {
  const faceCount = mesh.geometry.index
    ? Math.floor(mesh.geometry.index.count / 3)
    : Math.floor((mesh.geometry.attributes.position?.count ?? 0) / 3)

  if (faceCount <= 0) return []
  return [...faceSelection].filter((face) => face >= 0 && face < faceCount)
}

function orderedBoundaryVertices(mesh: Mesh, faceIndices: number[]): number[] {
  const edgeCounts = new Map<string, { a: number; b: number; count: number }>()

  for (const faceIndex of faceIndices) {
    const face = faceVertexIndices(mesh, faceIndex)
    if (!face) continue
    addEdge(edgeCounts, face[0], face[1])
    addEdge(edgeCounts, face[1], face[2])
    addEdge(edgeCounts, face[2], face[0])
  }

  const boundary = [...edgeCounts.values()].filter((edge) => edge.count === 1)
  if (boundary.length === 0) return uniqueFaceVertices(mesh, faceIndices)

  const neighbors = new Map<number, number[]>()
  for (const edge of boundary) {
    const a = neighbors.get(edge.a) ?? []
    const b = neighbors.get(edge.b) ?? []
    a.push(edge.b)
    b.push(edge.a)
    neighbors.set(edge.a, a)
    neighbors.set(edge.b, b)
  }

  const start = [...neighbors.keys()].sort((a, b) => a - b)[0]
  const ordered = [start]
  let previous = -1
  let current = start

  for (let guard = 0; guard < boundary.length + 2; guard++) {
    const next = (neighbors.get(current) ?? []).find((candidate) => candidate !== previous)
    if (next === undefined || next === start) break
    ordered.push(next)
    previous = current
    current = next
  }

  return ordered.length >= 3 ? ordered : uniqueFaceVertices(mesh, faceIndices)
}

function uniqueFaceVertices(mesh: Mesh, faceIndices: number[]): number[] {
  const vertices: number[] = []
  const seen = new Set<number>()
  for (const faceIndex of faceIndices) {
    const face = faceVertexIndices(mesh, faceIndex)
    if (!face) continue
    for (const vertex of face) {
      if (seen.has(vertex)) continue
      seen.add(vertex)
      vertices.push(vertex)
    }
  }
  return vertices
}

function faceVertexIndices(mesh: Mesh, faceIndex: number): [number, number, number] | null {
  const pos = mesh.geometry.attributes.position
  if (!pos) return null

  if (mesh.geometry.index) {
    const i = faceIndex * 3
    return [
      mesh.geometry.index.getX(i),
      mesh.geometry.index.getX(i + 1),
      mesh.geometry.index.getX(i + 2),
    ]
  }

  const base = faceIndex * 3
  if (base + 2 >= pos.count) return null
  return [base, base + 1, base + 2]
}

function addEdge(edges: Map<string, { a: number; b: number; count: number }>, a: number, b: number) {
  const key = `${Math.min(a, b)}_${Math.max(a, b)}`
  const edge = edges.get(key)
  if (edge) edge.count++
  else edges.set(key, { a, b, count: 1 })
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
