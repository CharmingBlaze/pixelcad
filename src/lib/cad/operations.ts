import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import type { Mesh } from 'three'
import type { EditMode } from './types'
import { selectedVertexIndices } from './selectionGeometry'
import { rebuildMeshOutline } from './outlineSystem'

type PositionAttribute = {
  getX: (index: number) => number
  getY: (index: number) => number
  getZ: (index: number) => number
}

export function addWireEdges(mesh: Mesh): void {
  rebuildMeshOutline(mesh)
}

export function extrudeFace(mesh: Mesh, faceIndex: number): void {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!idx || !pos) return

  const arr = Array.from(idx.array)
  const i = faceIndex * 3
  const a = arr[i]
  const b = arr[i + 1]
  const c = arr[i + 2]

  const va = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a))
  const vb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
  const vc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c))
  const norm = new Vector3()
    .crossVectors(vb.clone().sub(va), vc.clone().sub(va))
    .normalize()
    .multiplyScalar(0.5)

  const newPos = Array.from(pos.array as Float32Array)
  const base = pos.count
  newPos.push(
    va.x + norm.x,
    va.y + norm.y,
    va.z + norm.z,
    vb.x + norm.x,
    vb.y + norm.y,
    vb.z + norm.z,
    vc.x + norm.x,
    vc.y + norm.y,
    vc.z + norm.z,
  )

  const newIdx = [...arr]
  newIdx.splice(i, 3)
  newIdx.push(base, base + 1, base + 2)
  newIdx.push(a, b, base + 1, a, base + 1, base)
  newIdx.push(b, c, base + 2, b, base + 2, base + 1)
  newIdx.push(c, a, base, c, base, base + 2)

  const newGeo = new BufferGeometry()
  newGeo.setAttribute('position', new Float32BufferAttribute(newPos, 3))
  newGeo.setIndex(newIdx)
  newGeo.computeVertexNormals()
  mesh.geometry.dispose()
  mesh.geometry = newGeo
  addWireEdges(mesh)
}

export function extrudeFaces(mesh: Mesh, faceIndices: Set<number>, distance = 0.35): Set<number> {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!idx || !pos || faceIndices.size === 0) return new Set()

  const srcIdx = Array.from(idx.array)
  const newPos = Array.from(pos.array as Float32Array)
  const normal = averageFaceNormal(pos, srcIdx, faceIndices).multiplyScalar(distance)
  const duplicated = new Map<number, number>()

  const duplicateVertex = (vertexIndex: number): number => {
    const existing = duplicated.get(vertexIndex)
    if (existing !== undefined) return existing
    const next = newPos.length / 3
    newPos.push(
      pos.getX(vertexIndex) + normal.x,
      pos.getY(vertexIndex) + normal.y,
      pos.getZ(vertexIndex) + normal.z,
    )
    duplicated.set(vertexIndex, next)
    return next
  }

  const newIdx: number[] = []
  for (let i = 0; i < srcIdx.length; i += 3) {
    if (!faceIndices.has(i / 3)) newIdx.push(srcIdx[i], srcIdx[i + 1], srcIdx[i + 2])
  }

  const topFaces = new Set<number>()
  const boundary = selectedBoundaryEdges(srcIdx, faceIndices)

  for (let i = 0; i < srcIdx.length; i += 3) {
    const fi = i / 3
    if (!faceIndices.has(fi)) continue
    topFaces.add(newIdx.length / 3)
    newIdx.push(
      duplicateVertex(srcIdx[i]),
      duplicateVertex(srcIdx[i + 1]),
      duplicateVertex(srcIdx[i + 2]),
    )
  }

  boundary.forEach(([a, b]) => {
    const da = duplicateVertex(a)
    const db = duplicateVertex(b)
    newIdx.push(a, b, db, a, db, da)
  })

  replaceGeometry(mesh, newPos, newIdx)
  return topFaces
}

export function insetFaces(mesh: Mesh, faceIndices: Set<number>, amount = 0.18): boolean {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!idx || !pos || faceIndices.size === 0) return false

  const data = buildInsetMeshData(
    Array.from(pos.array as Float32Array),
    Array.from(idx.array),
    faceIndices,
    amount,
  )
  if (!data) return false
  replaceGeometry(mesh, data.positions, data.indices)
  return true
}

export function buildInsetMeshData(
  positions: number[],
  indices: number[],
  faceIndices: Set<number>,
  amount: number,
): { positions: number[]; indices: number[] } | null {
  if (faceIndices.size === 0) return null
  const clamped = Math.max(0, Math.min(0.95, amount))
  if (clamped <= 0.00001) return { positions: [...positions], indices: [...indices] }

  const posAttr = {
    getX: (i: number) => positions[i * 3],
    getY: (i: number) => positions[i * 3 + 1],
    getZ: (i: number) => positions[i * 3 + 2],
  }

  const newPos = [...positions]
  const newIdx: number[] = []

  for (let i = 0; i < indices.length; i += 3) {
    const fi = i / 3
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    if (!faceIndices.has(fi)) {
      newIdx.push(a, b, c)
      continue
    }

    const va = new Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a))
    const vb = new Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b))
    const vc = new Vector3(posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c))
    const center = va.clone().add(vb).add(vc).multiplyScalar(1 / 3)

    const ia = pushPoint(newPos, va.clone().lerp(center, clamped))
    const ib = pushPoint(newPos, vb.clone().lerp(center, clamped))
    const ic = pushPoint(newPos, vc.clone().lerp(center, clamped))

    newIdx.push(ia, ib, ic)
    newIdx.push(a, b, ib, a, ib, ia)
    newIdx.push(b, c, ic, b, ic, ib)
    newIdx.push(c, a, ia, c, ia, ic)
  }

  return { positions: newPos, indices: newIdx }
}

export function buildInsetPreview(mesh: Mesh, faceIndices: Set<number>, amount: number): BufferGeometry | null {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos || !idx || faceIndices.size === 0) return null

  const data = buildInsetMeshData(
    Array.from(pos.array as Float32Array),
    Array.from(idx.array),
    faceIndices,
    amount,
  )
  if (!data) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
  geo.setIndex(data.indices)
  geo.computeVertexNormals()
  return geo
}

export function flipFaces(mesh: Mesh, faceIndices: Set<number>): boolean {
  const idx = mesh.geometry.index
  if (!idx || faceIndices.size === 0) return false
  const arr = Array.from(idx.array)
  faceIndices.forEach((fi) => {
    const i = fi * 3
    const b = arr[i + 1]
    arr[i + 1] = arr[i + 2]
    arr[i + 2] = b
  })
  mesh.geometry.setIndex(arr)
  mesh.geometry.computeVertexNormals()
  addWireEdges(mesh)
  return true
}

export function subdivide(mesh: Mesh, faceFilter: Set<number> | null = null, cuts = 1, smooth = 0): void {
  const sp = mesh.geometry.attributes.position
  const si = mesh.geometry.index
  if (!si || !sp) return

  const data = buildSubdivideMeshData(
    Array.from(sp.array as Float32Array),
    Array.from(si.array),
    faceFilter && faceFilter.size > 0 ? faceFilter : null,
    cuts,
    smooth,
  )
  replaceGeometry(mesh, data.positions, data.indices)
}

export function buildSubdivideMeshData(
  positions: number[],
  indices: number[],
  faceFilter: Set<number> | null,
  cuts: number,
  smooth = 0,
): { positions: number[]; indices: number[] } {
  let pos = [...positions]
  let idx = [...indices]
  let activeFaces = faceFilter ? new Set(faceFilter) : null

  const cutCount = Math.max(1, Math.min(4, Math.round(cuts)))
  for (let cut = 0; cut < cutCount; cut++) {
    const next = subdivideMeshOnce(pos, idx, activeFaces, smooth)
    pos = next.positions
    idx = next.indices
    activeFaces = next.subdividedFaces
  }

  return { positions: pos, indices: idx }
}

export function buildSubdividePreview(
  mesh: Mesh,
  faceFilter: Set<number> | null,
  cuts: number,
  smooth: number,
): BufferGeometry | null {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos || !idx) return null

  const data = buildSubdivideMeshData(
    Array.from(pos.array as Float32Array),
    Array.from(idx.array),
    faceFilter && faceFilter.size > 0 ? faceFilter : null,
    cuts,
    smooth,
  )

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
  geo.setIndex(data.indices)
  geo.computeVertexNormals()
  return geo
}

function subdivideMeshOnce(
  positions: number[],
  indices: number[],
  faceFilter: Set<number> | null,
  smooth: number,
): { positions: number[]; indices: number[]; subdividedFaces: Set<number> } {
  const posAttr = {
    getX: (i: number) => positions[i * 3],
    getY: (i: number) => positions[i * 3 + 1],
    getZ: (i: number) => positions[i * 3 + 2],
  }

  const newPos = [...positions]
  const newIdx: number[] = []
  const edgeMidCache: Record<string, number> = {}
  const subdividedFaces = new Set<number>()
  const smoothFactor = Math.max(0, Math.min(1, smooth))

  function midpoint(a: number, b: number, centroid: Vector3): number {
    const key = `${Math.min(a, b)}_${Math.max(a, b)}`
    if (edgeMidCache[key] !== undefined) return edgeMidCache[key]

    const va = new Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a))
    const vb = new Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b))
    let point = va.clone().add(vb).multiplyScalar(0.5)
    if (smoothFactor > 0) {
      point.lerp(centroid, smoothFactor * 0.65)
    }
    const index = pushPoint(newPos, point)
    edgeMidCache[key] = index
    return index
  }

  for (let i = 0; i < indices.length; i += 3) {
    const fi = i / 3
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]

    if (faceFilter && !faceFilter.has(fi)) {
      newIdx.push(a, b, c)
      continue
    }

    const va = new Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a))
    const vb = new Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b))
    const vc = new Vector3(posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c))
    const centroid = va.clone().add(vb).add(vc).multiplyScalar(1 / 3)

    const ab = midpoint(a, b, centroid)
    const bc = midpoint(b, c, centroid)
    const ca = midpoint(c, a, centroid)

    const baseFace = newIdx.length / 3
    newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    subdividedFaces.add(baseFace)
    subdividedFaces.add(baseFace + 1)
    subdividedFaces.add(baseFace + 2)
    subdividedFaces.add(baseFace + 3)
  }

  return { positions: newPos, indices: newIdx, subdividedFaces }
}

export function boundaryEdgesForFaces(mesh: Mesh, faceIndices: Set<number>): Set<string> {
  const idx = mesh.geometry.index
  if (!idx || faceIndices.size === 0) return new Set()
  const arr = Array.from(idx.array)
  return new Set(selectedBoundaryEdges(arr, faceIndices).map(([a, b]) => edgeId(a, b)))
}

export function planarProjectUv(mesh: Mesh, axis: 'x' | 'y' | 'z' = 'y'): boolean {
  const pos = mesh.geometry.attributes.position
  if (!pos) return false
  const uv: number[] = []
  const a = axis === 'x' ? 'y' : 'x'
  const b = axis === 'z' ? 'y' : 'z'
  const coords: [number, number][] = []
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity

  for (let i = 0; i < pos.count; i++) {
    const u = a === 'x' ? pos.getX(i) : pos.getY(i)
    const v = b === 'y' ? pos.getY(i) : pos.getZ(i)
    coords.push([u, v])
    minU = Math.min(minU, u)
    minV = Math.min(minV, v)
    maxU = Math.max(maxU, u)
    maxV = Math.max(maxV, v)
  }

  const spanU = Math.max(maxU - minU, 0.0001)
  const spanV = Math.max(maxV - minV, 0.0001)
  coords.forEach(([u, v]) => uv.push((u - minU) / spanU, (v - minV) / spanV))

  mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return true
}

export function bevelVerts(mesh: Mesh, vertIndices: Set<number>, width = 0.12): boolean {
  if (vertIndices.size === 0) return false
  const edges = collectIncidentEdges(mesh, vertIndices)
  return applyBevelEdges(mesh, edges, width)
}

export function collectIncidentEdges(mesh: Mesh, vertIndices: Set<number>): Set<string> {
  const idx = mesh.geometry.index
  if (!idx || vertIndices.size === 0) return new Set()
  const arr = idx.array
  const edges = new Set<string>()
  for (let i = 0; i < arr.length; i += 3) {
    const pairs: [number, number][] = [
      [arr[i], arr[i + 1]],
      [arr[i + 1], arr[i + 2]],
      [arr[i + 2], arr[i]],
    ]
    for (const [a, b] of pairs) {
      if (vertIndices.has(a) || vertIndices.has(b)) edges.add(edgeId(a, b))
    }
  }
  return edges
}

export function buildBevelMeshData(
  positions: number[],
  indices: number[],
  selectedEdges: Set<string>,
  width: number,
): { positions: number[]; indices: number[] } | null {
  if (selectedEdges.size === 0) return null
  if (width <= 0.00001) return { positions: [...positions], indices: [...indices] }

  const newPos = [...positions]
  const splitCache = new Map<string, [number, number]>()

  const readVec = (vi: number) =>
    new Vector3(newPos[vi * 3], newPos[vi * 3 + 1], newPos[vi * 3 + 2])

  const pushVec = (v: Vector3) => {
    const index = newPos.length / 3
    newPos.push(v.x, v.y, v.z)
    return index
  }

  const getSplit = (a: number, b: number): [number, number] => {
    const id = edgeId(a, b)
    const cached = splitCache.get(id)
    if (cached) return cached

    const pa = readVec(a)
    const pb = readVec(b)
    const dir = pb.clone().sub(pa)
    const len = dir.length()
    if (len < 0.00001) return [a, b]
    const w = Math.min(width, len * 0.49)
    dir.multiplyScalar(1 / len)
    const split: [number, number] = [
      pushVec(pa.clone().add(dir.clone().multiplyScalar(w))),
      pushVec(pb.clone().sub(dir.clone().multiplyScalar(w))),
    ]
    splitCache.set(id, split)
    return split
  }

  const isSelected = (a: number, b: number) => selectedEdges.has(edgeId(a, b))

  const newIndices: number[] = []
  for (let i = 0; i < indices.length; i += 3) {
    const v0 = indices[i]
    const v1 = indices[i + 1]
    const v2 = indices[i + 2]

    if (isSelected(v0, v1)) {
      const [na, nb] = getSplit(v0, v1)
      newIndices.push(v0, na, v2, na, nb, v2, nb, v1, v2)
      continue
    }
    if (isSelected(v1, v2)) {
      const [na, nb] = getSplit(v1, v2)
      newIndices.push(v1, na, v0, na, nb, v0, nb, v2, v0)
      continue
    }
    if (isSelected(v2, v0)) {
      const [na, nb] = getSplit(v2, v0)
      newIndices.push(v2, na, v1, na, nb, v1, nb, v0, v1)
      continue
    }
    newIndices.push(v0, v1, v2)
  }

  return { positions: newPos, indices: newIndices }
}

export function buildBevelPreview(mesh: Mesh, selectedEdges: Set<string>, width: number): BufferGeometry | null {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos || !idx || selectedEdges.size === 0) return null

  const data = buildBevelMeshData(
    Array.from(pos.array as Float32Array),
    Array.from(idx.array),
    selectedEdges,
    width,
  )
  if (!data) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
  geo.setIndex(data.indices)
  geo.computeVertexNormals()
  return geo
}

export function applyBevelEdges(mesh: Mesh, edgeIds: Set<string>, width: number): boolean {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos || !idx || edgeIds.size === 0) return false

  const data = buildBevelMeshData(
    Array.from(pos.array as Float32Array),
    Array.from(idx.array),
    edgeIds,
    width,
  )
  if (!data) return false
  replaceGeometry(mesh, data.positions, data.indices)
  return true
}

export function grabMove(
  mesh: Mesh,
  vertIndices: Set<number>,
  faceIndices: Set<number>,
  editMode: string,
  delta: Vector3,
): void {
  if (editMode === 'object') {
    mesh.position.add(delta)
    return
  }

  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos) return

  const toMove = new Set<number>()
  if (editMode === 'vertex') {
    vertIndices.forEach((i) => toMove.add(i))
  } else if (editMode === 'face' && idx) {
    const arr = idx.array
    faceIndices.forEach((fi) => {
      toMove.add(arr[fi * 3])
      toMove.add(arr[fi * 3 + 1])
      toMove.add(arr[fi * 3 + 2])
    })
  }

  if (toMove.size === 0) return

  toMove.forEach((i) => {
    pos.setXYZ(i, pos.getX(i) + delta.x, pos.getY(i) + delta.y, pos.getZ(i) + delta.z)
  })
  pos.needsUpdate = true
  geo.computeVertexNormals()
  addWireEdges(mesh)
}

export function grabMoveBySelection(
  mesh: Mesh,
  editMode: EditMode,
  vertIndices: Set<number>,
  edgeIds: Set<string>,
  faceIndices: Set<number>,
  delta: Vector3,
  rebuildOutline = true,
): void {
  if (editMode === 'object') {
    mesh.position.add(delta)
    return
  }

  const pos = mesh.geometry.attributes.position
  if (!pos) return
  const toMove = selectedVertexIndices(mesh, editMode, vertIndices, edgeIds, faceIndices)
  if (toMove.size === 0) return

  toMove.forEach((i) => {
    pos.setXYZ(i, pos.getX(i) + delta.x, pos.getY(i) + delta.y, pos.getZ(i) + delta.z)
  })
  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
  if (rebuildOutline) addWireEdges(mesh)
}

export function deleteSelectedElements(
  mesh: Mesh,
  editMode: EditMode,
  vertIndices: Set<number>,
  edgeIds: Set<string>,
  faceIndices: Set<number>,
): boolean {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos || !idx || editMode === 'object') return false

  const removeFaces = new Set<number>()
  const arr = Array.from(idx.array)

  if (editMode === 'face') {
    faceIndices.forEach((fi) => removeFaces.add(fi))
  } else if (editMode === 'vertex') {
    for (let i = 0; i < arr.length; i += 3) {
      if (vertIndices.has(arr[i]) || vertIndices.has(arr[i + 1]) || vertIndices.has(arr[i + 2])) {
        removeFaces.add(i / 3)
      }
    }
  } else if (editMode === 'edge') {
    for (let i = 0; i < arr.length; i += 3) {
      const pairs = [
        edgeId(arr[i], arr[i + 1]),
        edgeId(arr[i + 1], arr[i + 2]),
        edgeId(arr[i + 2], arr[i]),
      ]
      if (pairs.some((eid) => edgeIds.has(eid))) removeFaces.add(i / 3)
    }
  }

  if (removeFaces.size === 0) return false

  const newIdx: number[] = []
  for (let i = 0; i < arr.length; i += 3) {
    if (removeFaces.has(i / 3)) continue
    newIdx.push(arr[i], arr[i + 1], arr[i + 2])
  }
  geo.setIndex(newIdx)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  addWireEdges(mesh)
  return true
}

export function bevelEdges(mesh: Mesh, edgeIds: Set<string>, width = 0.12): boolean {
  if (edgeIds.size === 0) return false
  return applyBevelEdges(mesh, edgeIds, width)
}

function edgeId(a: number, b: number) {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

export function averageFaceNormal(
  pos: PositionAttribute,
  indices: number[],
  faceIndices: Set<number>,
): Vector3 {
  const normal = new Vector3()
  faceIndices.forEach((fi) => {
    const i = fi * 3
    const va = new Vector3(pos.getX(indices[i]), pos.getY(indices[i]), pos.getZ(indices[i]))
    const vb = new Vector3(pos.getX(indices[i + 1]), pos.getY(indices[i + 1]), pos.getZ(indices[i + 1]))
    const vc = new Vector3(pos.getX(indices[i + 2]), pos.getY(indices[i + 2]), pos.getZ(indices[i + 2]))
    normal.add(vb.sub(va).cross(vc.sub(va)).normalize())
  })
  if (normal.lengthSq() < 0.0000001) return new Vector3(0, 1, 0)
  return normal.normalize()
}

function selectedBoundaryEdges(indices: number[], faceIndices: Set<number>): [number, number][] {
  const edgeUse = new Map<string, { edge: [number, number]; count: number }>()
  for (let i = 0; i < indices.length; i += 3) {
    if (!faceIndices.has(i / 3)) continue
    const pairs: [number, number][] = [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ]
    for (const pair of pairs) {
      const id = edgeId(pair[0], pair[1])
      const existing = edgeUse.get(id)
      if (existing) existing.count++
      else edgeUse.set(id, { edge: pair, count: 1 })
    }
  }
  return [...edgeUse.values()].filter((entry) => entry.count === 1).map((entry) => entry.edge)
}

function pushPoint(points: number[], point: Vector3): number {
  const index = points.length / 3
  points.push(point.x, point.y, point.z)
  return index
}

function replaceGeometry(mesh: Mesh, positions: number[], indices: number[]) {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  mesh.geometry.dispose()
  mesh.geometry = geo
  addWireEdges(mesh)
}

const MERGE_WELD_EPSILON = 0.015

export function mergePolygonIntoMesh(
  mesh: Mesh,
  worldVertices: Vector3[],
  indices: number[],
  weldEpsilon = MERGE_WELD_EPSILON,
): boolean {
  const pos = mesh.geometry.attributes.position
  if (!pos || worldVertices.length < 3 || indices.length < 3) return false

  mesh.updateMatrixWorld(true)
  const localVertices = worldVertices.map((v) => mesh.worldToLocal(v.clone()))

  const positions: number[] = Array.from(pos.array as Float32Array)
  const existingIndices = mesh.geometry.index ? Array.from(mesh.geometry.index.array) : []
  if (existingIndices.length === 0 && pos.count >= 3) {
    for (let i = 0; i < pos.count; i += 3) {
      existingIndices.push(i, i + 1, i + 2)
    }
  }

  const epsSq = weldEpsilon * weldEpsilon

  const findVertexIndex = (v: Vector3): number => {
    for (let i = 0; i < positions.length; i += 3) {
      const dx = positions[i] - v.x
      const dy = positions[i + 1] - v.y
      const dz = positions[i + 2] - v.z
      if (dx * dx + dy * dy + dz * dz <= epsSq) return i / 3
    }
    const next = positions.length / 3
    positions.push(v.x, v.y, v.z)
    return next
  }

  const remapped: number[] = []
  for (const vi of indices) {
    if (vi < 0 || vi >= localVertices.length) return false
    remapped.push(findVertexIndex(localVertices[vi]))
  }

  replaceGeometry(mesh, positions, [...existingIndices, ...remapped])
  return true
}

export function mirrorMesh(mesh: Mesh, axis: 'x' | 'y' | 'z'): boolean {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  if (!pos) return false

  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (axisIndex === 0) pos.setXYZ(i, -x, y, z)
    else if (axisIndex === 1) pos.setXYZ(i, x, -y, z)
    else pos.setXYZ(i, x, y, -z)
  }
  pos.needsUpdate = true

  if (idx) {
    const arr = Array.from(idx.array)
    for (let i = 0; i < arr.length; i += 3) {
      const b = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = b
    }
    mesh.geometry.setIndex(arr)
  }

  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
  addWireEdges(mesh)
  return true
}

export function fillEdgeLoop(mesh: Mesh, edgeIds: Set<string>): boolean {
  if (edgeIds.size < 3) return false
  const loops = loopsFromEdges(edgeIds)
  if (loops.length !== 1 || loops[0].length < 3) return false
  return appendLoopFaces(mesh, loops[0])
}

export function fillHoles(mesh: Mesh, maxLoopVerts = 128): number {
  const boundary = allBoundaryLoops(mesh)
  let filled = 0
  for (const loop of boundary) {
    if (loop.length < 3 || loop.length > maxLoopVerts) continue
    if (appendLoopFaces(mesh, loop)) filled++
  }
  return filled
}

export function buildExtrudePreview(
  mesh: Mesh,
  faceIndices: Set<number>,
  distance: number,
): BufferGeometry | null {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!idx || !pos || faceIndices.size === 0) return null

  const srcIdx = Array.from(idx.array)
  const newPos = Array.from(pos.array as Float32Array)
  const normal = averageFaceNormal(pos, srcIdx, faceIndices).multiplyScalar(distance)
  const duplicated = new Map<number, number>()

  const duplicateVertex = (vertexIndex: number): number => {
    const existing = duplicated.get(vertexIndex)
    if (existing !== undefined) return existing
    const next = newPos.length / 3
    newPos.push(
      pos.getX(vertexIndex) + normal.x,
      pos.getY(vertexIndex) + normal.y,
      pos.getZ(vertexIndex) + normal.z,
    )
    duplicated.set(vertexIndex, next)
    return next
  }

  const newIdx: number[] = []
  for (let i = 0; i < srcIdx.length; i += 3) {
    if (!faceIndices.has(i / 3)) newIdx.push(srcIdx[i], srcIdx[i + 1], srcIdx[i + 2])
  }

  const boundary = selectedBoundaryEdges(srcIdx, faceIndices)
  for (let i = 0; i < srcIdx.length; i += 3) {
    if (!faceIndices.has(i / 3)) continue
    newIdx.push(
      duplicateVertex(srcIdx[i]),
      duplicateVertex(srcIdx[i + 1]),
      duplicateVertex(srcIdx[i + 2]),
    )
  }
  boundary.forEach(([a, b]) => {
    const da = duplicateVertex(a)
    const db = duplicateVertex(b)
    newIdx.push(a, b, db, a, db, da)
  })

  const preview = new BufferGeometry()
  preview.setAttribute('position', new Float32BufferAttribute(newPos, 3))
  preview.setIndex(newIdx)
  preview.computeVertexNormals()
  return preview
}

function appendLoopFaces(mesh: Mesh, loop: number[]): boolean {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos || !idx || loop.length < 3) return false

  const indices = triangulateLoop(loop, pos)
  if (indices.length < 3) return false

  const newIdx = [...Array.from(idx.array), ...indices]
  geo.setIndex(newIdx)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  addWireEdges(mesh)
  return true
}

function triangulateLoop(loop: number[], pos: PositionAttribute): number[] {
  if (loop.length === 3) return [loop[0], loop[1], loop[2]]
  const contour = loop.map((vi) => new Vector2(pos.getX(vi), pos.getZ(vi)))
  try {
    return ShapeUtils.triangulateShape(contour, [])
      .flat()
      .map((i) => loop[i])
  } catch {
    const indices: number[] = []
    for (let i = 1; i < loop.length - 1; i++) indices.push(loop[0], loop[i], loop[i + 1])
    return indices
  }
}

function loopsFromEdges(edgeIds: Set<string>): number[][] {
  const adjacency = new Map<number, number[]>()
  edgeIds.forEach((eid) => {
    const [a, b] = eid.split('_').map((n) => parseInt(n, 10))
    if (!Number.isFinite(a) || !Number.isFinite(b)) return
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a)!.push(b)
    adjacency.get(b)!.push(a)
  })

  const loops: number[][] = []
  const visitedEdges = new Set<string>()

  for (const start of adjacency.keys()) {
    const neighbors = adjacency.get(start)!
    if (neighbors.length !== 2) continue
    const firstEdge = edgeId(start, neighbors[0])
    if (visitedEdges.has(firstEdge)) continue

    const loop: number[] = [start]
    let prev = start
    let current = neighbors[0]
    visitedEdges.add(firstEdge)

    while (current !== start && loop.length <= adjacency.size + 2) {
      loop.push(current)
      const nextOptions = adjacency.get(current) ?? []
      const next = nextOptions.find((v) => v !== prev)
      if (next === undefined) break
      visitedEdges.add(edgeId(current, next))
      prev = current
      current = next
    }

    if (current === start && loop.length >= 3) loops.push(loop)
  }

  return loops
}

function allBoundaryLoops(mesh: Mesh): number[][] {
  const idx = mesh.geometry.index
  const pos = mesh.geometry.attributes.position
  if (!idx || !pos) return []

  const arr = Array.from(idx.array)
  const edgeUse = new Map<string, { edge: [number, number]; count: number }>()
  for (let i = 0; i < arr.length; i += 3) {
    const pairs: [number, number][] = [
      [arr[i], arr[i + 1]],
      [arr[i + 1], arr[i + 2]],
      [arr[i + 2], arr[i]],
    ]
    for (const pair of pairs) {
      const id = edgeId(pair[0], pair[1])
      const existing = edgeUse.get(id)
      if (existing) existing.count++
      else edgeUse.set(id, { edge: pair, count: 1 })
    }
  }

  const boundaryEdges = new Set<string>()
  edgeUse.forEach((entry, id) => {
    if (entry.count === 1) boundaryEdges.add(id)
  })
  return loopsFromEdges(boundaryEdges)
}
