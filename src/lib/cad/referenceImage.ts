import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Camera,
  type Object3D,
} from 'three'
import type { CadObject } from './types'

const textureLoader = new TextureLoader()
const DEFAULT_MAX_SIZE = 4
let referenceImageRenderOrder = 1

export function isReferenceImage(obj: CadObject): boolean {
  return obj.type === 'referenceImage'
}

export function isReferenceImageRoot(object: Object3D): boolean {
  return object.userData?.type === 'referenceImage'
}

export function isReferenceImageMesh(mesh: Mesh): boolean {
  return isReferenceImageRoot(mesh)
}

export function getReferenceImagePlane(root: Object3D): Mesh | null {
  if (!isReferenceImageRoot(root)) return null

  if (root instanceof Mesh && root.userData.referenceImagePlane === true) {
    return root
  }

  const child = root.children.find(
    (node) => node instanceof Mesh && node.userData.referenceImagePlane === true,
  )
  return (child as Mesh | undefined) ?? null
}

export function getReferenceImageRootUserData(root: Object3D) {
  return root.userData
}

export function getPickableObjectMeshes(objects: CadObject[]): Mesh[] {
  const meshes: Mesh[] = []
  for (const obj of objects) {
    if (isReferenceImage(obj)) {
      const plane = getReferenceImagePlane(obj.mesh)
      if (plane) meshes.push(plane)
      continue
    }
    meshes.push(obj.mesh)
  }
  return meshes
}

export function findCadObjectBySceneNode(objects: CadObject[], node: Object3D): CadObject | undefined {
  return objects.find((obj) => {
    if (obj.mesh === node) return true
    if (isReferenceImage(obj) && obj.mesh.children.includes(node)) return true
    return false
  })
}

export function ensureReferenceImageStructure(obj: CadObject): void {
  if (!isReferenceImage(obj)) return

  const root = obj.mesh
  if (root instanceof Group && getReferenceImagePlane(root)) return

  if (!(root instanceof Mesh)) return

  const plane = root
  const parent = plane.parent
  const group = new Group()
  group.position.copy(plane.position)
  group.scale.copy(plane.scale)
  group.quaternion.set(0, 0, 0, 1)
  group.renderOrder = plane.renderOrder
  group.visible = plane.visible
  group.userData = { ...plane.userData, isReferenceImage: true, type: 'referenceImage' }

  plane.position.set(0, 0, 0)
  plane.scale.set(1, 1, 1)
  plane.quaternion.set(0, 0, 0, 1)
  plane.userData.referenceImagePlane = true

  parent?.remove(plane)
  group.add(plane)
  parent?.add(group)
  obj.mesh = group as unknown as Mesh
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|bmp|svg|tga)$/i.test(file.name)
}

export function imageFileFromDrop(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null
  const fromItems = [...dataTransfer.items]
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .find((file) => file && isImageFile(file))
  if (fromItems) return fromItems
  return [...dataTransfer.files].find((file) => isImageFile(file)) ?? null
}

export function dataTransferMayContainImage(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  if (imageFileFromDrop(dataTransfer)) return true
  if (![...dataTransfer.types].includes('Files')) return false
  return [...dataTransfer.items].some(
    (item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')),
  )
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Invalid image data'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

export function referenceImageNameFromFile(file: File, counter: number): string {
  const base = file.name.replace(/\.[^.]+$/, '').trim() || 'Image'
  return `Ref.${base}.${String(counter).padStart(3, '0')}`
}

function referencePlaneSize(aspect: number, maxSize = DEFAULT_MAX_SIZE): { width: number; height: number } {
  if (aspect >= 1) return { width: maxSize, height: maxSize / aspect }
  return { width: maxSize * aspect, height: maxSize }
}

export function createReferenceImageGeometry(aspect: number): PlaneGeometry {
  const { width, height } = referencePlaneSize(aspect)
  return new PlaneGeometry(width, height)
}

export async function loadReferenceTexture(url: string): Promise<Texture> {
  const texture = await textureLoader.loadAsync(url)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function syncReferenceImageMaterial(root: Object3D, selected: boolean): void {
  if (!isReferenceImageRoot(root)) return
  const plane = getReferenceImagePlane(root)
  if (!plane) return

  const texture = root.userData.referenceTexture as Texture | undefined
  let material = plane.material as MeshBasicMaterial

  if (!(material instanceof MeshBasicMaterial) || material.userData.isReferenceImage !== true) {
    disposeReferenceImageMaterial(plane)
    material = new MeshBasicMaterial()
    material.userData.isReferenceImage = true
    plane.material = material
  }

  material.map = texture ?? null
  material.transparent = true
  material.depthWrite = true
  material.depthTest = true
  material.side = DoubleSide
  material.color.setHex(selected ? 0xfff4cc : 0xffffff)
  material.polygonOffset = true
  material.polygonOffsetFactor = -1
  material.polygonOffsetUnits = -1
  material.toneMapped = false
  material.needsUpdate = true
}

/** @deprecated Use syncReferenceImageMaterial */
export function applyReferenceImageMaterial(mesh: Mesh, selected: boolean): MeshBasicMaterial {
  syncReferenceImageMaterial(mesh, selected)
  const plane = getReferenceImagePlane(mesh) ?? mesh
  return plane.material as MeshBasicMaterial
}

export function disposeReferenceImageMaterial(mesh: Mesh) {
  const current = mesh.material
  if (!current) return
  const materials = Array.isArray(current) ? current : [current]
  for (const material of materials) {
    if (material instanceof MeshBasicMaterial) {
      material.map = null
      material.dispose()
    } else {
      material.dispose()
    }
  }
}

export function nextReferenceImageRenderOrder(): number {
  return referenceImageRenderOrder++
}

export function disposeReferenceImageResources(root: Object3D) {
  const texture = root.userData.referenceTexture as Texture | undefined
  texture?.dispose()
  root.userData.referenceTexture = null
}

export function disposeReferenceImageObject(root: Object3D) {
  const plane = getReferenceImagePlane(root)
  if (plane) {
    disposeReferenceImageMaterial(plane)
    plane.geometry.dispose()
  }
  disposeReferenceImageResources(root)
}

export function updateReferenceBillboards(
  objects: CadObject[],
  camera: Camera,
  skipObjectId: string | null = null,
) {
  for (const obj of objects) {
    if (!isReferenceImage(obj) || !obj.node.visible) continue
    if (skipObjectId && obj.id === skipObjectId) continue

    ensureReferenceImageStructure(obj)
    const root = obj.mesh
    const plane = getReferenceImagePlane(root)
    if (!plane) continue

    if (root instanceof Group) {
      root.quaternion.set(0, 0, 0, 1)
    }
    plane.quaternion.copy(camera.quaternion)
  }
}

export async function restoreReferenceImageFromUrl(obj: CadObject): Promise<void> {
  if (!isReferenceImage(obj)) return
  const url = obj.mesh.userData.referenceImageUrl as string | undefined
  if (!url) return
  const texture = await loadReferenceTexture(url)
  obj.mesh.userData.referenceTexture = texture
}

export async function loadReferenceImageAspect(url: string): Promise<number> {
  const { width, height } = await loadImageDimensions(url)
  return width / Math.max(1, height)
}

export function createReferenceImageRoot(
  plane: Mesh,
  position: { x: number; y: number; z: number },
  userData: Record<string, unknown>,
): Group {
  plane.userData.referenceImagePlane = true
  const root = new Group()
  root.position.set(position.x, position.y, position.z)
  root.userData = userData
  root.add(plane)
  return root
}
