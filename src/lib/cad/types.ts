import type { BufferGeometry, Mesh, Vector3 } from 'three'

export type EditMode = 'object' | 'vertex' | 'edge' | 'face'
export type ActiveTool = 'select' | 'grab' | 'extrudeface' | 'insetface' | 'subdividetool' | 'bevel' | 'drawbox' | 'drawpoly'
export type PolyDrawMode = 'triangle' | 'quad' | 'poly'
export type PolyDrawSpace = '2d' | '3d'
export type ShadingMode = 'solid' | 'wire' | 'matcap'
export type FaceSideMode = 'front' | 'back' | 'double'
export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type TransformSpace = 'world' | 'local'
export type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'torus' | 'plane' | 'polygon'
export type ObjectKind = 'mesh' | 'group'
export type SelectionVisualState = 'normal' | 'hover' | 'selected'

export interface CadMaterial {
  id: string
  name: string
  color: string
  roughness: number
  metalness: number
  flatShading: boolean
}

export interface UvChannel {
  id: string
  name: string
  active: boolean
}

export interface SceneNode {
  id: string
  name: string
  kind: ObjectKind
  parentId: string | null
  children: string[]
  visible: boolean
  locked: boolean
}

export interface GeometryStats {
  vertices: number
  edges: number
  faces: number
}

export interface CadObject {
  id: string
  mesh: Mesh
  type: PrimitiveType
  name: string
  node: SceneNode
  materialId: string
  uvChannels: UvChannel[]
  stats: GeometryStats
}

export interface ViewportConfig {
  id: string
  label: string
  ortho: boolean
  eye: [number, number, number]
  up: [number, number, number]
}

export interface ViewportRuntime {
  config: ViewportConfig
  ortho: boolean
  orbitTarget: Vector3
  zoom: number
}
