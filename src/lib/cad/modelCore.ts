import type { BufferGeometry, Mesh } from 'three'
import { DEFAULT_MATERIAL_ID } from './materials'
import type { CadObject, GeometryStats, PrimitiveType, SceneNode, UvChannel } from './types'

export function createSceneNode(id: string, name: string): SceneNode {
  return {
    id,
    name,
    kind: 'mesh',
    parentId: null,
    children: [],
    visible: true,
    locked: false,
  }
}

export function createDefaultUvChannels(): UvChannel[] {
  return [{ id: 'uv0', name: 'UV Map', active: true }]
}

export function geometryStats(geometry: BufferGeometry): GeometryStats {
  const vertices = geometry.attributes.position?.count ?? 0
  const faceCount = geometry.index ? geometry.index.count / 3 : vertices / 3
  return {
    vertices,
    faces: Math.floor(faceCount),
    edges: countUniqueEdges(geometry),
  }
}

export function countUniqueEdges(geometry: BufferGeometry): number {
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

export function createCadObject(args: {
  id: string
  mesh: Mesh
  type: PrimitiveType
  name: string
  materialId?: string
}): CadObject {
  const node = createSceneNode(args.id, args.name)
  return {
    id: args.id,
    mesh: args.mesh,
    type: args.type,
    name: args.name,
    node,
    materialId: args.materialId ?? DEFAULT_MATERIAL_ID,
    uvChannels: createDefaultUvChannels(),
    stats: geometryStats(args.mesh.geometry),
  }
}

export function syncObjectMetadata(obj: CadObject): CadObject {
  obj.node.name = obj.name
  obj.node.visible = obj.mesh.visible
  obj.stats = geometryStats(obj.mesh.geometry)
  const userData = obj.mesh.userData
  obj.mesh.userData = {
    ...userData,
    id: obj.id,
    name: obj.name,
    type: obj.type,
    materialId: obj.materialId,
    uvChannels: obj.uvChannels,
    stats: obj.stats,
    uvImageUrl: userData.uvImageUrl,
    uvImageName: userData.uvImageName,
    uvTexture: userData.uvTexture,
    uvIslandSnapshots: userData.uvIslandSnapshots,
    uvInitializedIslands: userData.uvInitializedIslands,
    uvIslandSlotCount: userData.uvIslandSlotCount,
  }
  return obj
}
