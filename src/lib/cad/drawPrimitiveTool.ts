import {
  BoxGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
} from 'three'
import { createPrimitiveInBox, type BoxBounds } from './geometry'
import type { PrimitiveType } from './types'

export type DrawPhase = 'idle' | 'footprint' | 'height'

const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const MIN_BASE = 0.08
const MIN_HEIGHT = 0.08
const GRID = 0.5

const raycaster = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()

export interface DrawPointerTarget {
  camera: Camera
  element: HTMLElement
}

export class DrawPrimitiveTool {
  phase: DrawPhase = 'idle'
  primitiveType: PrimitiveType | null = null
  startPoint: Vector3 | null = null
  footprintPoint: Vector3 | null = null
  heightY = MIN_HEIGHT
  private lastClientY: number | null = null

  private scene: Scene | null = null
  private readonly root = new Group()
  private readonly footprintFill: Mesh
  private readonly boxLines: LineSegments
  private readonly previewMesh: Mesh

  constructor() {
    this.footprintFill = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: 0x4191ff,
        transparent: true,
        opacity: 0.18,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.footprintFill.rotation.x = -Math.PI / 2
    this.boxLines = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0x9ed0ff, toneMapped: false }),
    )
    this.previewMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: 0x4191ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.root.add(this.footprintFill, this.boxLines, this.previewMesh)
    this.root.visible = false
  }

  attachScene(scene: Scene) {
    this.scene = scene
    scene.add(this.root)
  }

  detachScene() {
    this.root.removeFromParent()
    this.scene = null
  }

  start(type: PrimitiveType) {
    this.cancel()
    this.primitiveType = type
    this.phase = 'idle'
    this.root.visible = false
  }

  cancel() {
    this.phase = 'idle'
    this.primitiveType = null
    this.startPoint = null
    this.footprintPoint = null
    this.heightY = MIN_HEIGHT
    this.lastClientY = null
    this.root.visible = false
  }

  isActive() {
    return this.primitiveType !== null
  }

  statusText(): string {
    if (!this.primitiveType) return ''
    const name = this.primitiveType.charAt(0).toUpperCase() + this.primitiveType.slice(1)
    if (this.phase === 'idle') {
      return `Draw ${name}: click to set the start corner on the ground`
    }
    if (this.phase === 'footprint') {
      return `Draw ${name}: move to set width/depth, click to lock the base`
    }
    if (this.primitiveType === 'plane') return ''
    return `Draw ${name}: move up/down or scroll wheel for height, click to place`
  }

  handleClick(target: DrawPointerTarget, clientX: number, clientY: number, snap: boolean) {
    if (!this.primitiveType) return false
    const point = this.pointerOnGround(target, clientX, clientY, snap)
    if (!point) return true

    if (this.phase === 'idle') {
      this.startPoint = point.clone()
      this.footprintPoint = point.clone()
      this.phase = 'footprint'
      this.updatePreview()
      return true
    }

    if (this.phase === 'footprint') {
      this.footprintPoint = point.clone()
      const bounds = this.footprintBounds()
      if (!bounds || !footprintLargeEnough(bounds)) return true
      if (this.primitiveType === 'plane') {
        this.commit({ min: bounds.min.clone(), max: new Vector3(bounds.max.x, bounds.min.y, bounds.max.z) })
        return true
      }
      this.phase = 'height'
      this.heightY = bounds.min.y + MIN_HEIGHT
      this.lastClientY = clientY
      this.updatePreview()
      return true
    }

    if (this.phase === 'height') {
      const bounds = this.fullBounds()
      if (!bounds || bounds.max.y - bounds.min.y < MIN_HEIGHT) return true
      this.commit(bounds)
      return true
    }

    return false
  }

  handleMove(
    target: DrawPointerTarget,
    clientX: number,
    clientY: number,
    snap: boolean,
    pixelsToWorld = 0.02,
  ) {
    if (!this.primitiveType) return

    if (this.phase === 'footprint' && this.startPoint) {
      const point = this.pointerOnGround(target, clientX, clientY, snap)
      if (point) this.footprintPoint = point
      this.updatePreview()
      return
    }

    if (this.phase === 'height') {
      const base = this.footprintBounds()
      if (!base) return
      const center = base.min.clone().add(base.max).multiplyScalar(0.5)
      const floor = base.min.y + MIN_HEIGHT

      const camDir = target.camera.getWorldDirection(new Vector3())
      let normal = new Vector3(camDir.x, 0, camDir.z)
      if (normal.lengthSq() < 0.0001) normal.set(1, 0, 0)
      normal.normalize()
      const verticalPlane = new Plane().setFromNormalAndCoplanarPoint(normal, center)
      const worldPoint = this.intersectPlane(target, clientX, clientY, verticalPlane)

      if (worldPoint) {
        let y = Math.max(floor, worldPoint.y)
        if (snap) y = snapValue(y)
        this.heightY = y
      } else if (this.lastClientY !== null) {
        const dy = clientY - this.lastClientY
        let y = Math.max(floor, this.heightY - dy * pixelsToWorld)
        if (snap) y = snapValue(y)
        this.heightY = y
      }

      this.lastClientY = clientY
      this.updatePreview()
    }
  }

  handleWheel(deltaY: number, snap: boolean) {
    if (this.phase !== 'height' || !this.primitiveType) return
    const step = snap ? GRID : 0.1
    const floor = (this.footprintBounds()?.min.y ?? 0) + MIN_HEIGHT
    this.heightY = Math.max(floor, this.heightY + (deltaY > 0 ? -step : step))
    this.updatePreview()
  }

  currentBounds(): BoxBounds | null {
    if (this.phase === 'height') return this.fullBounds()
    return this.footprintBounds()
  }

  onCommit: ((type: PrimitiveType, bounds: BoxBounds) => void) | null = null

  private commit(bounds: BoxBounds) {
    const type = this.primitiveType
    this.cancel()
    if (!type) return
    this.onCommit?.(type, bounds)
  }

  private footprintBounds(): BoxBounds | null {
    if (!this.startPoint || !this.footprintPoint) return null
    const min = new Vector3(
      Math.min(this.startPoint.x, this.footprintPoint.x),
      0,
      Math.min(this.startPoint.z, this.footprintPoint.z),
    )
    const max = new Vector3(
      Math.max(this.startPoint.x, this.footprintPoint.x),
      0,
      Math.max(this.startPoint.z, this.footprintPoint.z),
    )
    return { min, max }
  }

  private fullBounds(): BoxBounds | null {
    const base = this.footprintBounds()
    if (!base) return null
    return {
      min: base.min.clone(),
      max: new Vector3(base.max.x, this.heightY, base.max.z),
    }
  }

  private updatePreview() {
    if (!this.primitiveType) {
      this.root.visible = false
      return
    }

    const bounds =
      this.phase === 'height'
        ? this.fullBounds()
        : this.phase === 'footprint'
          ? this.footprintBounds()
          : null

    if (!bounds) {
      this.root.visible = false
      return
    }

    const size = bounds.max.clone().sub(bounds.min)
    const center = bounds.min.clone().add(bounds.max).multiplyScalar(0.5)
    this.root.visible = true

    if (this.phase === 'footprint') {
      this.footprintFill.visible = footprintLargeEnough(bounds)
      this.footprintFill.scale.set(Math.max(size.x, 0.001), Math.max(size.z, 0.001), 1)
      this.footprintFill.position.set(center.x, 0.01, center.z)
      const previewHeight = MIN_HEIGHT
      this.boxLines.scale.set(Math.max(size.x, 0.001), previewHeight, Math.max(size.z, 0.001))
      this.boxLines.position.set(center.x, previewHeight / 2, center.z)
      this.previewMesh.visible = false
      return
    }

    this.footprintFill.visible = false
    this.boxLines.scale.set(Math.max(size.x, 0.001), Math.max(size.y, 0.001), Math.max(size.z, 0.001))
    this.boxLines.position.copy(center)

    if (this.phase === 'height' || this.primitiveType === 'plane') {
      const geo = createPrimitiveInBox(this.primitiveType, bounds.min, bounds.max)
      this.previewMesh.geometry.dispose()
      this.previewMesh.geometry = geo
      this.previewMesh.position.set(0, 0, 0)
      this.previewMesh.visible = true
    } else {
      this.previewMesh.visible = false
    }
  }

  private pointerOnGround(
    target: DrawPointerTarget,
    clientX: number,
    clientY: number,
    snap: boolean,
  ): Vector3 | null {
    const p = this.intersectPlane(target, clientX, clientY, GROUND)
    if (!p) return null
    if (snap) {
      p.x = snapValue(p.x)
      p.z = snapValue(p.z)
    }
    p.y = 0
    return p
  }

  private intersectPlane(
    target: DrawPointerTarget,
    clientX: number,
    clientY: number,
    plane: Plane,
  ): Vector3 | null {
    const rect = target.element.getBoundingClientRect()
    ndc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, target.camera)
    return raycaster.ray.intersectPlane(plane, hit)?.clone() ?? null
  }
}

function snapValue(value: number) {
  return Math.round(value / GRID) * GRID
}

function footprintLargeEnough(bounds: BoxBounds) {
  return (
    Math.abs(bounds.max.x - bounds.min.x) >= MIN_BASE &&
    Math.abs(bounds.max.z - bounds.min.z) >= MIN_BASE
  )
}

let toolInstance: DrawPrimitiveTool | null = null

export function initDrawPrimitiveTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new DrawPrimitiveTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getDrawPrimitiveTool() {
  return toolInstance
}
