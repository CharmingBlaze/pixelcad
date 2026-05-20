import {
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Mesh as ThreeMesh,
  type Scene,
} from 'three'
import { buildSubdividePreview } from './operations'

const GRID = 0.05

export class SubdivideTool {
  active = false
  cuts = 1
  smooth = 0
  faceIndices: Set<number> | null = null

  private mesh: ThreeMesh | null = null
  private lastClientY: number | null = null
  private readonly root = new Group()
  private readonly previewMesh: Mesh

  constructor() {
    this.previewMesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: 0xc89bff,
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

  attachScene(_scene: Scene) {}

  detachScene() {
    this.cancel()
  }

  start(mesh: ThreeMesh, faces: Set<number> | null) {
    this.cancel()
    this.mesh = mesh
    mesh.add(this.root)
    this.faceIndices = faces && faces.size > 0 ? new Set(faces) : null
    this.cuts = 1
    this.smooth = 0
    this.lastClientY = null
    this.active = true
    this.updatePreview()
  }

  cancel() {
    this.active = false
    this.mesh = null
    this.faceIndices = null
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
    const scope = this.faceIndices ? 'selection' : 'mesh'
    return `SubD (${scope}): scroll cuts (${this.cuts}), drag smooth (${this.smooth.toFixed(2)}), click to confirm`
  }

  handleWheel(deltaY: number, _snap: boolean) {
    if (!this.active) return
    this.cuts = Math.max(1, Math.min(4, this.cuts + (deltaY > 0 ? -1 : 1)))
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
    this.smooth = Math.max(0, Math.min(1, this.smooth + dy * step))
    this.updatePreview()
  }

  onCommit: ((cuts: number, smooth: number, faceIndices: Set<number> | null) => void) | null = null

  commit() {
    if (!this.active || !this.mesh) return
    const cuts = this.cuts
    const smooth = this.smooth
    const faces = this.faceIndices ? new Set(this.faceIndices) : null
    this.onCommit?.(cuts, smooth, faces)
    this.cancel()
  }

  private updatePreview() {
    if (!this.active || !this.mesh) {
      this.root.visible = false
      return
    }

    const geo = buildSubdividePreview(this.mesh, this.faceIndices, this.cuts, this.smooth)
    if (!geo) {
      this.root.visible = false
      return
    }

    if (this.previewMesh.geometry) this.previewMesh.geometry.dispose()
    this.previewMesh.geometry = geo
    this.root.visible = true
  }
}

let toolInstance: SubdivideTool | null = null

export function initSubdivideTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new SubdivideTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getSubdivideTool() {
  return toolInstance
}
