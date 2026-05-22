import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
} from 'three'
import type { Scene } from 'three'
import { geoForType } from './geometry'
import { DEFAULT_MATERIAL_ID, matDefault, cloneMaterialLibrary } from './materials'
import { addWireEdges } from './operations'
import { createCadObject, createSceneNode, syncObjectMetadata } from './modelCore'
import { createReferenceImageRoot } from './referenceImage'
import type { CadMaterial, CadObject, PrimitiveType, SceneNode, UvChannel } from './types'

const SCENE_VERSION = 1

interface SerializedGeometry {
  positions: number[]
  indices: number[] | null
  uvs?: number[] | null
}

interface SerializedObject {
  id?: string
  type: PrimitiveType
  name: string
  parentId?: string | null
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  materialId?: string
  uvChannels?: UvChannel[]
  uvImageUrl?: string
  uvImageName?: string
  referenceImageUrl?: string
  referenceImageName?: string
  visible?: boolean
  locked?: boolean
  geometry: SerializedGeometry
}

interface SceneFile {
  version: number
  materials?: CadMaterial[]
  groups?: SerializedGroup[]
  rootNodeIds?: string[]
  objects: SerializedObject[]
}

interface SerializedGroup {
  id: string
  name: string
  visible: boolean
  locked: boolean
  children: string[]
}

function serializeGeometry(geo: BufferGeometry): SerializedGeometry {
  const pos = geo.attributes.position
  const positions: number[] = []
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
  }
  const indices = geo.index ? Array.from(geo.index.array) : null
  const uvAttr = geo.attributes.uv
  const uvs: number[] | null = uvAttr
    ? Array.from({ length: uvAttr.count }, (_, i) => {
        return [uvAttr.getX(i), uvAttr.getY(i)]
      }).flat()
    : null
  return { positions, indices, uvs }
}

function deserializeGeometry(data: SerializedGeometry): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
  if (data.uvs?.length) {
    geo.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2))
  }
  if (data.indices?.length) geo.setIndex(data.indices)
  geo.computeVertexNormals()
  return geo
}

export function serializeScene(
  objects: CadObject[],
  groups: SceneNode[] = [],
  rootNodeIds: string[] = objects.map((o) => o.id),
  materials: CadMaterial[] = [],
): string {
  const file: SceneFile = {
    version: SCENE_VERSION,
    materials: materials.map((mat) => ({ ...mat })),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      visible: g.visible,
      locked: g.locked,
      children: [...g.children],
    })),
    rootNodeIds,
    objects: objects.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      parentId: o.node.parentId,
      materialId: o.materialId,
      uvChannels: o.uvChannels,
      uvImageUrl: o.mesh.userData.uvImageUrl as string | undefined,
      uvImageName: o.mesh.userData.uvImageName as string | undefined,
      referenceImageUrl: o.mesh.userData.referenceImageUrl as string | undefined,
      referenceImageName: o.mesh.userData.referenceImageName as string | undefined,
      visible: o.node.visible,
      locked: o.node.locked,
      position: o.mesh.position.toArray() as [number, number, number],
      rotation: [o.mesh.rotation.x, o.mesh.rotation.y, o.mesh.rotation.z],
      scale: o.mesh.scale.toArray() as [number, number, number],
      geometry: serializeGeometry(o.mesh.geometry),
    })),
  }
  return JSON.stringify(file, null, 2)
}

export function deserializeScene(
  json: string,
  scene: Scene,
): { objects: CadObject[]; groups: SceneNode[]; rootNodeIds: string[]; counter: number; materials: CadMaterial[] } {
  const file = JSON.parse(json) as SceneFile
  let counter = 0
  const objects: CadObject[] = []
  const groups = (file.groups ?? []).map((group) => ({
    ...createSceneNode(group.id, group.name),
    kind: 'group' as const,
    visible: group.visible,
    locked: group.locked,
    children: [...group.children],
  }))

  for (const item of file.objects) {
    const geo =
      item.geometry.positions.length > 0
        ? deserializeGeometry(item.geometry)
        : geoForType(item.type)

    let sceneNode: Mesh | Group
    if (item.type === 'referenceImage') {
      const plane = new Mesh(geo, matDefault())
      sceneNode = createReferenceImageRoot(
        plane,
        { x: item.position[0], y: item.position[1], z: item.position[2] },
        {
          type: item.type,
          name: item.name,
          isReferenceImage: true,
          outline: null,
          wireEdges: null,
          materialId: item.materialId ?? DEFAULT_MATERIAL_ID,
          uvImageUrl: item.uvImageUrl,
          uvImageName: item.uvImageName,
          referenceImageUrl: item.referenceImageUrl,
          referenceImageName: item.referenceImageName,
        },
      )
      sceneNode.scale.fromArray(item.scale)
    } else {
      const mesh = new Mesh(geo, matDefault())
      mesh.position.fromArray(item.position)
      mesh.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2])
      mesh.scale.fromArray(item.scale)
      mesh.userData = {
        type: item.type,
        name: item.name,
        outline: null,
        wireEdges: null,
        materialId: item.materialId ?? DEFAULT_MATERIAL_ID,
        uvImageUrl: item.uvImageUrl,
        uvImageName: item.uvImageName,
      }
      addWireEdges(mesh)
      sceneNode = mesh
    }
    scene.add(sceneNode)

    const match = item.name.match(/\.(\d+)$/)
    if (match) counter = Math.max(counter, parseInt(match[1], 10))

    const obj = createCadObject({
      id: item.id ?? crypto.randomUUID(),
      mesh: sceneNode as Mesh,
      type: item.type,
      name: item.name,
      materialId: item.materialId ?? DEFAULT_MATERIAL_ID,
    })
    obj.node.parentId = item.parentId ?? null
    if (item.visible !== undefined) {
      obj.node.visible = item.visible
      obj.mesh.visible = item.visible
    }
    if (item.locked !== undefined) obj.node.locked = item.locked
    if (item.uvChannels?.length) obj.uvChannels = item.uvChannels
    objects.push(syncObjectMetadata(obj))
  }

  const knownIds = new Set([...objects.map((o) => o.id), ...groups.map((g) => g.id)])
  const rootNodeIds = (file.rootNodeIds ?? objects.filter((o) => !o.node.parentId).map((o) => o.id))
    .filter((id) => knownIds.has(id))
  for (const obj of objects) if (!obj.node.parentId && !rootNodeIds.includes(obj.id)) rootNodeIds.push(obj.id)
  for (const group of groups) if (!rootNodeIds.includes(group.id)) rootNodeIds.push(group.id)

  const materials = cloneMaterialLibrary(file.materials)

  return { objects, groups, rootNodeIds, counter, materials }
}

export function downloadSceneJson(
  objects: CadObject[],
  groups: SceneNode[] = [],
  rootNodeIds: string[] = objects.map((o) => o.id),
  materials: CadMaterial[] = [],
  filename = 'scene.lpcad.json',
) {
  const blob = new Blob([serializeScene(objects, groups, rootNodeIds, materials)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function pickSceneFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.lpcad.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve(await file.text())
    }
    input.click()
  })
}
