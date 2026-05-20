import {
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Mesh as ThreeMesh,
  type Scene,
} from 'three'
import { buildInsetPreview } from './operations'

const MIN_AMOUNT = 0.01
const DEFAULT_AMOUNT = 0.15
const GRID = 0.02

export class InsetFaceTool {
  active = false
  amount = DEFAULT_AMOUNT
  faceIndices = new Set<number>()

  private mesh: ThreeMesh | null = null
  private lastClientY: number | null = null
  private readonly root = new Group()
  private readonly previewMesh: Mesh

  constructor() {
    this.previewMesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: 0x5fd4a4,
        transparent: true,
        opacity: 0.3,
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

  start(mesh: ThreeMesh, faces: Set<number>) {
    this.cancel()
    if (faces.size === 0) return
    this.mesh = mesh
    mesh.add(this.root)
    this.faceIndices = new Set(faces)
    this.amount = DEFAULT_AMOUNT
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
    return `Inset: drag or scroll for thickness (${this.amount.toFixed(2)}), click to confirm, Esc to cancel`
  }

  handleWheel(deltaY: number, snap: boolean) {
    if (!this.active) return
    const step = snap ? GRID : 0.01
    this.amount = clampAmount(this.amount + (deltaY > 0 ? -step : step))
    if (snap) this.amount = Math.round(this.amount / GRID) * GRID
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
    const step = snap ? GRID : 0.005
    this.amount = clampAmount(this.amount + dy * step)
    if (snap) this.amount = Math.round(this.amount / GRID) * GRID
    this.updatePreview()
  }

  onCommit: ((amount: number, faceIndices: Set<number>) => void) | null = null

  commit() {
    if (!this.active || !this.mesh) return
    const amount = this.amount
    const faces = new Set(this.faceIndices)
    this.onCommit?.(amount, faces)
    this.cancel()
  }

  private updatePreview() {
    if (!this.active || !this.mesh || this.faceIndices.size === 0) {
      this.root.visible = false
      return
    }

    const geo = buildInsetPreview(this.mesh, this.faceIndices, this.amount)
    if (!geo) {
      this.root.visible = false
      return
    }

    if (this.previewMesh.geometry) this.previewMesh.geometry.dispose()
    this.previewMesh.geometry = geo
    this.root.visible = true
  }
}

function clampAmount(value: number) {
  return Math.max(MIN_AMOUNT, Math.min(0.92, value))
}

let toolInstance: InsetFaceTool | null = null

export function initInsetFaceTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new InsetFaceTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getInsetFaceTool() {
  return toolInstance
}
