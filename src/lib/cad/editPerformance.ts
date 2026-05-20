import type { BufferGeometry } from 'three'

export const EDIT_HELPER_LIMITS = {
  vertices: 2400,
  edges: 1800,
  faces: 900,
}

export interface GeometryComplexity {
  vertices: number
  edges: number
  faces: number
}

export function geometryComplexity(geometry: BufferGeometry): GeometryComplexity {
  const vertices = geometry.attributes.position?.count ?? 0
  const faces = geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(vertices / 3)
  return {
    vertices,
    faces,
    edges: countEdges(geometry),
  }
}

export function helperStride(count: number, limit: number): number {
  if (count <= limit) return 1
  return Math.max(1, Math.ceil(count / limit))
}

function countEdges(geometry: BufferGeometry): number {
  const index = geometry.index?.array
  if (!index) return Math.floor((geometry.attributes.position?.count ?? 0) / 3) * 3

  const edges = new Set<string>()
  for (let i = 0; i < index.length; i += 3) {
    addEdge(edges, index[i], index[i + 1])
    addEdge(edges, index[i + 1], index[i + 2])
    addEdge(edges, index[i + 2], index[i])
  }
  return edges.size
}

function addEdge(edges: Set<string>, a: number, b: number) {
  edges.add(`${Math.min(a, b)}_${Math.max(a, b)}`)
}
