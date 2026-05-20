import {
  Matrix4,
  Vector3,
  type BufferAttribute,
  type Mesh,
} from 'three'
import type { EditMode } from './types'

export interface SelectableEdge {
  id: string
  a: number
  b: number
}

interface EdgeFaceInfo {
  a: number
  b: number
  normals: Vector3[]
}

export function selectedVertexIndices(
  mesh: Mesh,
  editMode: EditMode,
  vertIndices: Set<number>,
  edgeIds: Set<string>,
  faceIndices: Set<number>,
): Set<number> {
  const selected = new Set<number>()
  const idx = mesh.geometry.index

  if (editMode === 'vertex') {
    vertIndices.forEach((i) => selected.add(i))
  } else if (editMode === 'edge') {
    edgeIds.forEach((edgeId) => {
      const [a, b] = edgeId.split('_').map((n) => parseInt(n, 10))
      if (Number.isFinite(a)) selected.add(a)
      if (Number.isFinite(b)) selected.add(b)
    })
  } else if (editMode === 'face' && idx) {
    const arr = idx.array
    faceIndices.forEach((fi) => {
      selected.add(arr[fi * 3])
      selected.add(arr[fi * 3 + 1])
      selected.add(arr[fi * 3 + 2])
    })
  }

  return selected
}

export function edgeId(a: number, b: number): string {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

export function selectableEdges(mesh: Mesh, creaseAngleDeg = 1): SelectableEdge[] {
  const pos = mesh.geometry.attributes.position as BufferAttribute | undefined
  const idx = mesh.geometry.index
  if (!pos || !idx) return []

  const edges = new Map<string, EdgeFaceInfo>()
  const index = idx.array
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]
    const b = index[i + 1]
    const c = index[i + 2]
    const normal = faceNormal(pos, a, b, c)
    addEdgeFace(edges, a, b, normal)
    addEdgeFace(edges, b, c, normal)
    addEdgeFace(edges, c, a, normal)
  }

  const minDot = Math.cos((creaseAngleDeg * Math.PI) / 180)
  return [...edges.values()]
    .filter((edge) => {
      if (edge.normals.length < 2) return true
      if (edge.normals.length > 2) return true
      return edge.normals[0].dot(edge.normals[1]) < minDot
    })
    .map((edge) => ({ id: edgeId(edge.a, edge.b), a: edge.a, b: edge.b }))
}

export const FACE_SELECTION_CREASE_DEG = 30

export function coplanarFaceGroup(
  mesh: Mesh,
  faceIndex: number,
  creaseAngleDeg = FACE_SELECTION_CREASE_DEG,
): Set<number> {
  const pos = mesh.geometry.attributes.position as BufferAttribute | undefined
  const idx = mesh.geometry.index
  if (!pos || !idx || faceIndex < 0 || faceIndex >= idx.count / 3) return new Set([faceIndex])

  const index = idx.array
  const normals: Vector3[] = []
  const edgeFaces = new Map<string, number[]>()

  for (let i = 0; i < index.length; i += 3) {
    const fi = i / 3
    const a = index[i]
    const b = index[i + 1]
    const c = index[i + 2]
    normals[fi] = faceNormal(pos, a, b, c)
    addEdgeFaceIndex(edgeFaces, a, b, fi)
    addEdgeFaceIndex(edgeFaces, b, c, fi)
    addEdgeFaceIndex(edgeFaces, c, a, fi)
  }

  const minDot = Math.cos((creaseAngleDeg * Math.PI) / 180)
  const group = new Set<number>([faceIndex])
  const queue = [faceIndex]

  while (queue.length) {
    const current = queue.shift()!
    const i = current * 3
    const pairs: [number, number][] = [
      [index[i], index[i + 1]],
      [index[i + 1], index[i + 2]],
      [index[i + 2], index[i]],
    ]

    for (const [a, b] of pairs) {
      for (const neighbor of edgeFaces.get(edgeId(a, b)) ?? []) {
        if (group.has(neighbor)) continue
        if (normals[current].dot(normals[neighbor]) < minDot) continue
        group.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return group
}

function addEdgeFace(edges: Map<string, EdgeFaceInfo>, a: number, b: number, normal: Vector3) {
  const id = edgeId(a, b)
  const existing = edges.get(id)
  if (existing) {
    existing.normals.push(normal)
  } else {
    edges.set(id, {
      a: Math.min(a, b),
      b: Math.max(a, b),
      normals: [normal],
    })
  }
}

function addEdgeFaceIndex(edges: Map<string, number[]>, a: number, b: number, faceIndex: number) {
  const id = edgeId(a, b)
  const existing = edges.get(id)
  if (existing) existing.push(faceIndex)
  else edges.set(id, [faceIndex])
}

function faceNormal(pos: BufferAttribute, a: number, b: number, c: number): Vector3 {
  const va = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a))
  const vb = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
  const vc = new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c))
  return vb.sub(va).cross(vc.sub(va)).normalize()
}

export function selectionCenterLocal(mesh: Mesh, vertices: Set<number>): Vector3 | null {
  const pos = mesh.geometry.attributes.position as BufferAttribute | undefined
  if (!pos || vertices.size === 0) return null

  const center = new Vector3()
  vertices.forEach((i) => center.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))))
  center.multiplyScalar(1 / vertices.size)
  return center
}

export function selectionCenterWorld(mesh: Mesh, vertices: Set<number>): Vector3 | null {
  const center = selectionCenterLocal(mesh, vertices)
  if (!center) return null
  return mesh.localToWorld(center)
}

export function applyWorldMatrixDeltaToVertices(
  mesh: Mesh,
  vertices: Set<number>,
  previousWorld: Matrix4,
  nextWorld: Matrix4,
) {
  const pos = mesh.geometry.attributes.position as BufferAttribute | undefined
  if (!pos || vertices.size === 0) return

  const delta = new Matrix4().copy(nextWorld).multiply(new Matrix4().copy(previousWorld).invert())
  const toLocal = new Matrix4().copy(mesh.matrixWorld).invert()
  const point = new Vector3()

  vertices.forEach((i) => {
    point.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    mesh.localToWorld(point)
    point.applyMatrix4(delta).applyMatrix4(toLocal)
    pos.setXYZ(i, point.x, point.y, point.z)
  })

  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
}

export function applyWorldMatrixToVertexSnapshot(
  mesh: Mesh,
  originalLocalPositions: Map<number, Vector3>,
  previousWorld: Matrix4,
  nextWorld: Matrix4,
) {
  const pos = mesh.geometry.attributes.position as BufferAttribute | undefined
  if (!pos || originalLocalPositions.size === 0) return

  const delta = new Matrix4().copy(nextWorld).multiply(new Matrix4().copy(previousWorld).invert())
  const toLocal = new Matrix4().copy(mesh.matrixWorld).invert()
  const point = new Vector3()

  originalLocalPositions.forEach((original, index) => {
    point.copy(original)
    mesh.localToWorld(point)
    point.applyMatrix4(delta).applyMatrix4(toLocal)
    pos.setXYZ(index, point.x, point.y, point.z)
  })

  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
}
