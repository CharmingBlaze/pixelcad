import {
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
  TextureLoader,
  type Scene,
} from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { matDefault } from './materials'
import { addWireEdges } from './operations'
import { createCadObject } from './modelCore'
import type { CadMaterial, CadObject } from './types'

export type InterchangeExportFormat = 'obj' | 'gltf' | 'glb' | 'stl' | 'ply'
export type InterchangeImportFormat = InterchangeExportFormat

const textureLoader = new TextureLoader()

export function importAcceptFilter(): string {
  return '.obj,.gltf,.glb,.stl,.ply,model/obj,model/gltf+json,model/gltf-binary,model/stl,model/ply'
}

export function formatFromFilename(name: string): InterchangeImportFormat | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'obj') return 'obj'
  if (ext === 'gltf') return 'gltf'
  if (ext === 'glb') return 'glb'
  if (ext === 'stl') return 'stl'
  if (ext === 'ply') return 'ply'
  return null
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportMaterialForObject(obj: CadObject, materials: CadMaterial[]): MeshStandardMaterial {
  const def = materials.find((mat) => mat.id === obj.materialId) ?? materials[0]
  const map = (obj.mesh.userData.uvTexture as Texture | undefined) ?? null
  return new MeshStandardMaterial({
    name: def?.name ?? 'Material',
    color: new Color(def?.color ?? '#7a8ea8'),
    roughness: def?.roughness ?? 0.45,
    metalness: def?.metalness ?? 0,
    flatShading: def?.flatShading ?? true,
    map,
  })
}

function buildExportRoot(objects: CadObject[], materials: CadMaterial[]): Group {
  const root = new Group()
  root.name = 'Scene'

  for (const obj of objects) {
    const mesh = new Mesh(obj.mesh.geometry, exportMaterialForObject(obj, materials))
    mesh.name = obj.name
    mesh.position.copy(obj.mesh.position)
    mesh.rotation.copy(obj.mesh.rotation)
    mesh.scale.copy(obj.mesh.scale)
    mesh.updateMatrixWorld(true)
    root.add(mesh)
  }

  return root
}

export function exportCadScene(
  format: InterchangeExportFormat,
  objects: CadObject[],
  materials: CadMaterial[],
): void {
  if (!objects.length) {
    alert('Nothing to export.')
    return
  }

  const root = buildExportRoot(objects, materials)

  switch (format) {
    case 'obj': {
      const data = new OBJExporter().parse(root)
      downloadBlob(new Blob([data], { type: 'text/plain' }), 'scene.obj')
      return
    }
    case 'stl': {
      const data = new STLExporter().parse(root, { binary: true })
      downloadBlob(new Blob([data], { type: 'model/stl' }), 'scene.stl')
      return
    }
    case 'ply': {
      new PLYExporter().parse(root, (data) => {
        if (!data) {
          alert('Could not export PLY.')
          return
        }
        downloadBlob(new Blob([data], { type: 'model/ply' }), 'scene.ply')
      })
      return
    }
    case 'gltf':
    case 'glb': {
      const exporter = new GLTFExporter()
      exporter.parse(
        root,
        (result) => {
          if (format === 'glb' && result instanceof ArrayBuffer) {
            downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), 'scene.glb')
            return
          }
          const json = JSON.stringify(result, null, 2)
          downloadBlob(new Blob([json], { type: 'model/gltf+json' }), 'scene.gltf')
        },
        (error) => {
          console.error(error)
          alert('Could not export GLTF.')
        },
        { binary: format === 'glb' },
      )
      return
    }
  }
}

/** @deprecated Use exportCadScene('obj', ...) */
export function exportSceneObj(objects: CadObject[]): void {
  exportCadScene('obj', objects, [])
}

function cadMaterialFromThreeMaterial(
  material: Material | Material[],
  fallbackName: string,
  existing: CadMaterial[],
): { material: CadMaterial; created: boolean } {
  const src = Array.isArray(material) ? material[0] : material
  let color = '#7a8ea8'
  let roughness = 0.45
  let metalness = 0
  let flatShading = true
  const name = src?.name?.trim() || fallbackName

  if (src && 'color' in src && src.color instanceof Color) {
    color = `#${src.color.getHexString()}`
  }
  if (src && 'roughness' in src && typeof src.roughness === 'number') {
    roughness = src.roughness
  }
  if (src && 'metalness' in src && typeof src.metalness === 'number') {
    metalness = src.metalness
  }
  if (src && 'flatShading' in src) {
    flatShading = !!src.flatShading
  }

  const match = existing.find((entry) => entry.color.toLowerCase() === color.toLowerCase())
  if (match) return { material: match, created: false }

  const id = `mat-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return {
    material: { id, name, color, roughness, metalness, flatShading },
    created: true,
  }
}

function textureFromMaterial(material: Material | Material[]): Texture | null {
  const src = Array.isArray(material) ? material[0] : material
  if (src && 'map' in src && src.map instanceof Texture) {
    return src.map
  }
  return null
}

function prepareImportedGeometry(mesh: Mesh) {
  const geometry = mesh.geometry.clone()
  mesh.updateMatrixWorld(true)
  geometry.applyMatrix4(mesh.matrixWorld)
  const merged = mergeVertices(geometry)
  merged.computeVertexNormals()
  return merged
}

function meshToCadObject(
  mesh: Mesh,
  name: string,
  materials: CadMaterial[],
  objIndex: number,
): { object: CadObject; newMaterials: CadMaterial[] } {
  const { material: cadMat, created } = cadMaterialFromThreeMaterial(
    mesh.material,
    `${name} Material`,
    materials,
  )
  const newMaterials = created ? [cadMat] : []
  const geometry = prepareImportedGeometry(mesh)
  const cadMesh = new Mesh(geometry, matDefault())
  cadMesh.castShadow = true

  const texture = textureFromMaterial(mesh.material)
  const objectName = name || `Imported.${String(objIndex).padStart(3, '0')}`
  cadMesh.userData = {
    type: 'polygon',
    name: objectName,
    outline: null,
    wireEdges: null,
    materialId: cadMat.id,
    uvTexture: texture,
    uvImageName: texture ? objectName : undefined,
  }
  addWireEdges(cadMesh)

  const object = createCadObject({
    id: crypto.randomUUID(),
    mesh: cadMesh,
    type: 'polygon',
    name: objectName,
    materialId: cadMat.id,
  })

  return { object, newMaterials }
}

function collectImportMeshes(root: { traverse: (cb: (obj: unknown) => void) => void }): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((obj) => {
    if (obj instanceof Mesh && obj.geometry?.attributes?.position) {
      meshes.push(obj)
    }
  })
  return meshes
}

async function loadImportRoot(file: File, format: InterchangeImportFormat): Promise<Group | Mesh> {
  const url = URL.createObjectURL(file)

  try {
    switch (format) {
      case 'obj': {
        const text = await file.text()
        return new OBJLoader().parse(text)
      }
      case 'gltf':
      case 'glb': {
        const gltf = await new GLTFLoader().loadAsync(url)
        return gltf.scene
      }
      case 'stl': {
        const buffer = await file.arrayBuffer()
        const geometry = new STLLoader().parse(buffer)
        return new Mesh(geometry, matDefault())
      }
      case 'ply': {
        const buffer = await file.arrayBuffer()
        const geometry = new PLYLoader().parse(buffer)
        return new Mesh(geometry, matDefault())
      }
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface ImportInterchangeResult {
  objects: CadObject[]
  materials: CadMaterial[]
}

export async function importInterchangeFile(
  file: File,
  _scene: Scene,
  existingMaterials: CadMaterial[] = [],
): Promise<ImportInterchangeResult> {
  const format = formatFromFilename(file.name)
  if (!format) {
    throw new Error('Unsupported file type.')
  }

  const root = await loadImportRoot(file, format)
  const sourceMeshes = root instanceof Mesh ? [root] : collectImportMeshes(root)
  if (!sourceMeshes.length) {
    throw new Error('No mesh geometry found in file.')
  }

  const knownMaterials = [...existingMaterials]
  const materials: CadMaterial[] = []
  const objects: CadObject[] = []
  let index = 0

  for (const mesh of sourceMeshes) {
    index++
    const baseName = mesh.name?.trim() || `Imported.${String(index).padStart(3, '0')}`
    const { object, newMaterials } = meshToCadObject(
      mesh,
      baseName,
      [...knownMaterials, ...materials],
      index,
    )
    materials.push(...newMaterials)
    objects.push(object)

    mesh.geometry.dispose()
  }

  if (root instanceof Group) {
    root.clear()
  }

  return { objects, materials }
}

export async function pickInterchangeFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = importAcceptFilter()
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export async function restoreUvTextureFromUrl(obj: CadObject): Promise<void> {
  const url = obj.mesh.userData.uvImageUrl as string | undefined
  if (!url) return
  const texture = await textureLoader.loadAsync(url)
  obj.mesh.userData.uvTexture = texture
}
