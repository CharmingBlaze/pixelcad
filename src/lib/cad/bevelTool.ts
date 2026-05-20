import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Mesh as ThreeMesh,
  type Scene,
} from 'three'
import { buildBevelMeshData } from './operations'

const MIN_WIDTH = 0.01
const DEFAULT_WIDTH = 0.12
const GRID = 0.05

export class BevelTool {
  active = false
  width = DEFAULT_WIDTH
  edgeIds = new Set<string>()

  private mesh: ThreeMesh | null = null
  private lastClientY: number | null = null
  private sourcePositions: number[] = []
  private sourceIndices: number[] = []
  private readonly root = new Group()
  private readonly previewMesh: Mesh

  constructor() {
    this.previewMesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    )
    this.root.add(this.previewMesh)
    this.root.visible = false
  }

  attachScene(_scene: Scene) {
    // preview parents to mesh on start
  }

  detachScene() {
    this.cancel()
  }

  start(mesh: ThreeMesh, edges: Set<string>) {
    this.cancel()
    const pos = mesh.geometry.attributes.position
    const idx = mesh.geometry.index
    if (!pos || !idx || edges.size === 0) return

    this.mesh = mesh
    mesh.add(this.root)
    this.edgeIds = new Set(edges)
    this.sourcePositions = Array.from(pos.array as Float32Array)
    this.sourceIndices = Array.from(idx.array)
    this.width = DEFAULT_WIDTH
    this.lastClientY = null
    this.active = true
    this.updatePreview()
  }

  cancel() {
    this.active = false
    this.mesh = null
    this.edgeIds = new Set()
    this.sourcePositions = []
    this.sourceIndices = []
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
    return `Bevel: drag or scroll for width (${this.width.toFixed(2)}), click to confirm, Esc to cancel`
  }

  handleWheel(deltaY: number, snap: boolean) {
    if (!this.active) return
    const step = snap ? GRID : 0.01
    this.width = Math.max(MIN_WIDTH, this.width + (deltaY > 0 ? -step : step))
    if (snap) this.width = Math.round(this.width / GRID) * GRID
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
    this.width = Math.max(MIN_WIDTH, this.width + dy * step)
    if (snap) this.width = Math.round(this.width / GRID) * GRID
    this.updatePreview()
  }

  onCommit: ((width: number, edgeIds: Set<string>) => void) | null = null

  commit() {
    if (!this.active || !this.mesh) return
    const width = this.width
    const edges = new Set(this.edgeIds)
    this.onCommit?.(width, edges)
    this.cancel()
  }

  private updatePreview() {
    if (!this.active || !this.mesh || this.edgeIds.size === 0) {
      this.root.visible = false
      return
    }

    const data = buildBevelMeshData(this.sourcePositions, this.sourceIndices, this.edgeIds, this.width)
    if (!data) {
      this.root.visible = false
      return
    }

    if (this.previewMesh.geometry) this.previewMesh.geometry.dispose()
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
    geo.setIndex(data.indices)
    geo.computeVertexNormals()
    this.previewMesh.geometry = geo
    this.root.visible = true
  }
}

let toolInstance: BevelTool | null = null

export function initBevelTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new BevelTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getBevelTool() {
  return toolInstance
}
