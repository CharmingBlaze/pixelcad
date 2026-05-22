import {
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshPhongMaterial,
  type Mesh,
  type Texture,
  type Side,
} from 'three'
import type { CadMaterial, FaceSideMode, SelectionVisualState } from './types'
export const DEFAULT_MATERIAL_ID = 'mat-default'
export const SELECTED_MATERIAL_ID = 'mat-selected'

/** Object selection tint — matches gizmo active / sub-element selection gold. */
export const SELECTION_ACCENT = 0xffd64a
export const SELECTION_EMISSIVE = 0xc9a84a

export const defaultMaterialLibrary: CadMaterial[] = [
  {
    id: DEFAULT_MATERIAL_ID,
    name: 'Blue Clay',
    color: '#2a7adc',
    roughness: 0.45,
    metalness: 0,
    flatShading: true,
  },
  {
    id: 'mat-warm',
    name: 'Warm Sand',
    color: '#d88945',
    roughness: 0.55,
    metalness: 0,
    flatShading: true,
  },
  {
    id: 'mat-mint',
    name: 'Mint Plastic',
    color: '#4fbf9f',
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
  },
]

export function sideFromMode(mode: FaceSideMode): Side {
  switch (mode) {
    case 'back':
      return BackSide
    case 'double':
      return DoubleSide
    default:
      return FrontSide
  }
}

export const SOLID_SEE_THROUGH_OPACITY = 0.42

export function materialFromDefinition(
  def: CadMaterial,
  selected = false,
  faceSide: FaceSideMode = 'double',
  seeThrough = false,
  textureMap?: Texture | null,
) {
  const base = new Color(def.color)
  const color = textureMap ? new Color(0xffffff) : selected ? base.clone().offsetHSL(0, 0, 0.04) : base
  const emissive = selected ? new Color(SELECTION_EMISSIVE) : new Color(0x000000)
  const specular = selected
    ? new Color(0x665533)
    : new Color(0x111111).lerp(new Color(0xcccccc), def.metalness)

  return new MeshPhongMaterial({
    color,
    map: textureMap ?? null,
    emissive,
    emissiveIntensity: selected ? 0.08 : 0,
    specular,
    shininess: selected
      ? 35
      : Math.max(8, Math.round((1 - def.roughness) * 60 * (1 + def.metalness * 0.35))),
    flatShading: def.flatShading,
    side: sideFromMode(faceSide),
    transparent: seeThrough,
    opacity: seeThrough ? SOLID_SEE_THROUGH_OPACITY : 1,
    depthWrite: !seeThrough,
  })
}

export const matDefault = (faceSide: FaceSideMode = 'double') =>
  new MeshPhongMaterial({
    color: 0x2a7adc,
    specular: 0x224488,
    shininess: 30,
    flatShading: true,
    side: sideFromMode(faceSide),
  })

export const matSelected = () =>
  new MeshPhongMaterial({
    color: 0xe8c96a,
    emissive: SELECTION_EMISSIVE,
    emissiveIntensity: 0.08,
    specular: 0x665533,
    shininess: 40,
    flatShading: true,
  })

export const matWire = new MeshBasicMaterial({ color: 0x88aadd, wireframe: true })
export const matcapMat = new MeshNormalMaterial()

export function disposeOwnedMeshMaterial(mesh: Mesh) {
  const current = mesh.material
  if (!current) return
  const materials = Array.isArray(current) ? current : [current]
  for (const material of materials) {
    if (material && material !== matWire && material !== matcapMat) {
      material.dispose()
    }
  }
}

export function cloneMaterialLibrary(materials: CadMaterial[] = defaultMaterialLibrary): CadMaterial[] {
  return materials.map((mat) => ({ ...mat }))
}
export const edgeMat = new LineBasicMaterial({ color: 0x111111 })
export const helperOutlineMat = () =>
  new MeshBasicMaterial({ color: 0x111827, depthTest: false })
export const faceHelperMat = (state: SelectionVisualState) =>
  new MeshBasicMaterial({
    color: state === 'selected' ? 0xffb000 : state === 'hover' ? 0xffd64a : 0x33b7ff,
    depthTest: false,
    side: DoubleSide,
    transparent: true,
    opacity: state === 'selected' ? 0.24 : state === 'hover' ? 0.28 : 0.14,
  })
export const faceOutlineMat = (state: SelectionVisualState) =>
  new LineBasicMaterial({
    color: state === 'selected' ? 0xffb000 : state === 'hover' ? 0xffd64a : 0x1fd0c7,
    transparent: true,
    opacity: state === 'selected' ? 0.98 : state === 'hover' ? 0.92 : 0.3,
    depthTest: false,
    linewidth: 2,
  })
export const edgeHelperMat = (state: SelectionVisualState) =>
  new MeshBasicMaterial({
    color: state === 'selected' ? 0xffb000 : state === 'hover' ? 0xffd64a : 0x1fd0c7,
    depthTest: false,
    transparent: true,
    opacity: state === 'selected' ? 0.96 : state === 'hover' ? 0.9 : 0.28,
  })
