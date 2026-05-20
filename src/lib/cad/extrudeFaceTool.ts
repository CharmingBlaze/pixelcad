import {
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Camera,
  type Mesh as ThreeMesh,
  type Scene,
} from 'three'
import { buildExtrudePreview } from './operations'

const MIN_DISTANCE = 0.02
const GRID = 0.25

export interface ExtrudePointerTarget {
  camera: Camera
  element: HTMLElement
}

export class ExtrudeFaceTool {
  active = false
  distance = 0.35
  faceIndices = new Set<number>()
  extrudeNormal = new Vector3(0, 1, 0)

  private mesh: ThreeMesh | null = null
  private lastClientY: number | null = null
  private scene: Scene | null = null
  private readonly root = new Group()
  private readonly previewMesh: Mesh

  constructor() {
    this.previewMesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: 0x4191ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    )
    this.root.add(this.previewMesh)
    this.root.visible = false
  }

  attachScene(scene: Scene) {
    this.scene = scene
  }

  detachScene() {
    this.cancel()
    this.scene = null
  }

  start(mesh: ThreeMesh, faces: Set<number>, normal: Vector3) {
    this.cancel()
    this.mesh = mesh
    mesh.add(this.root)
    this.faceIndices = new Set(faces)
    this.extrudeNormal.copy(normal.lengthSq() > 0.000001 ? normal.normalize() : new Vector3(0, 1, 0))
    this.distance = 0.35
    this.lastClientY = null
    this.active = true
    this.updatePreview()
  }

  cancel() {
    this.active = false
    this.mesh = null
    this.faceIndices = new Set()
    this.lastClientY = null
    this.root.removeFromParent()
    this.root.visible = false
    if (this.previewMesh.geometry) {
      this.previewMesh.geometry.dispose()
      this.previewMesh.geometry = new BufferGeometry()
    }
  }

  statusText(): string {
    if (!this.active) return ''
    return `Extrude: move mouse or scroll for distance (${this.distance.toFixed(2)}), click to confirm, Esc to cancel`
  }

  handleClick(): boolean {
    if (!this.active) return false
    return true
  }

  handleWheel(deltaY: number, snap: boolean) {
    if (!this.active) return
    const step = snap ? GRID : 0.05
    this.distance = Math.max(MIN_DISTANCE, this.distance + (deltaY > 0 ? -step : step))
    if (snap) this.distance = Math.round(this.distance / GRID) * GRID
    this.updatePreview()
  }

  handleMove(clientY: number, snap: boolean) {
    if (!this.active) return
    if (this.lastClientY === null) {
      this.lastClientY = clientY
      return
    }
    const dy = this.lastClientY - clientY
    this.lastClientY = clientY
    const step = snap ? GRID : 0.01
    this.distance = Math.max(MIN_DISTANCE, this.distance + dy * step)
    if (snap) this.distance = Math.round(this.distance / GRID) * GRID
    this.updatePreview()
  }

  onCommit: ((distance: number) => void) | null = null

  commit() {
    if (!this.active || !this.mesh) return
    const dist = this.distance
    this.onCommit?.(dist)
    this.cancel()
  }

  private updatePreview() {
    if (!this.active || !this.mesh || this.faceIndices.size === 0) {
      this.root.visible = false
      return
    }

    const geo = buildExtrudePreview(this.mesh, this.faceIndices, this.distance)
    if (!geo) {
      this.root.visible = false
      return
    }

    if (this.previewMesh.geometry) this.previewMesh.geometry.dispose()
    this.previewMesh.geometry = geo
    this.root.visible = true
  }
}

let toolInstance: ExtrudeFaceTool | null = null

export function initExtrudeFaceTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new ExtrudeFaceTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getExtrudeFaceTool() {
  return toolInstance
}
