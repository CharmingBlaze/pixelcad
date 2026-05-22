import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'
import {
  CORNER_OPPOSITE,
  boundsFromPoints,
  cornerPoints,
  getMeshFitBounds,
  refitMeshToBounds,
  type StoredBounds,
} from './boxBounds'
import { GIZMO_ACTIVE } from './gizmoTheme'
import type { BoxBounds } from './geometry'
import type { PrimitiveType } from './types'

const HANDLE_SIZE = 0.12
const MIN_SIZE = 0.08
const GRID = 0.5

const raycaster = new Raycaster()
raycaster.params.Points = { threshold: 0.08 }
raycaster.params.Line = { threshold: 0.08 }
const ndc = new Vector2()
const hit = new Vector3()

export interface BoxGizmoPointerTarget {
  camera: Camera
  element: HTMLElement
}

export class BoxBoundsGizmo {
  readonly root = new Group()
  private readonly wireBox: LineSegments
  private readonly handles: Mesh[] = []
  private readonly handleMaterial = new MeshBasicMaterial({
    color: GIZMO_ACTIVE,
    depthTest: false,
    toneMapped: false,
  })
  private readonly handleHoverMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    toneMapped: false,
  })

  private target: Mesh | null = null
  private primitiveType: PrimitiveType | null = null
  private bounds: BoxBounds | null = null
  private activeHandle = -1
  private anchorCorner = new Vector3()
  private dragPlane = new Plane()
  private historyStarted = false

  onDraggingChange: ((dragging: boolean) => void) | null = null
  onRefit: (() => void) | null = null

  constructor() {
    this.wireBox = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: GIZMO_ACTIVE, toneMapped: false }),
    )
    this.root.add(this.wireBox)

    const handleGeo = new BoxGeometry(1, 1, 1)
    for (let i = 0; i < 8; i++) {
      const handle = new Mesh(handleGeo, this.handleMaterial)
      handle.renderOrder = 20
      handle.userData.handleIndex = i
      this.handles.push(handle)
      this.root.add(handle)
    }
  }

  dispose() {
    this.wireBox.geometry.dispose()
    ;(this.wireBox.material as LineBasicMaterial).dispose()
    for (const handle of this.handles) handle.geometry.dispose()
    this.handleMaterial.dispose()
    this.handleHoverMaterial.dispose()
    this.root.removeFromParent()
  }

  setTarget(mesh: Mesh | null, type: PrimitiveType | null) {
    this.target = mesh
    this.primitiveType = type
    this.bounds = mesh && type ? getMeshFitBounds(mesh) : null
    this.root.visible = !!(mesh && type && this.bounds)
    this.syncVisuals()
  }

  isDragging() {
    return this.activeHandle >= 0
  }

  syncVisuals() {
    if (!this.bounds) {
      this.root.visible = false
      return
    }

    const size = this.bounds.max.clone().sub(this.bounds.min)
    const center = this.bounds.min.clone().add(this.bounds.max).multiplyScalar(0.5)
    this.wireBox.scale.set(
      Math.max(size.x, 0.001),
      Math.max(size.y, 0.001),
      Math.max(size.z, 0.001),
    )
    this.wireBox.position.copy(center)

    const corners = cornerPoints(this.bounds)
    const handleScale = Math.max(
      HANDLE_SIZE,
      Math.max(size.x, size.y, size.z) * 0.06,
    )
    this.handles.forEach((handle, i) => {
      handle.position.copy(corners[i])
      handle.scale.setScalar(handleScale)
      handle.material = this.handleMaterial
    })
  }

  pointerDown(target: BoxGizmoPointerTarget, clientX: number, clientY: number): boolean {
    if (!this.target || !this.primitiveType || !this.bounds) return false
    const index = this.pickHandle(target, clientX, clientY)
    if (index < 0) return false

    this.activeHandle = index
    this.historyStarted = false
    const corners = cornerPoints(this.bounds)
    this.anchorCorner.copy(corners[CORNER_OPPOSITE[index]])

    const camDir = target.camera.getWorldDirection(new Vector3())
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir, corners[index])
    this.handles[index].material = this.handleHoverMaterial
    this.onDraggingChange?.(true)
    return true
  }

  pointerMove(
    target: BoxGizmoPointerTarget,
    clientX: number,
    clientY: number,
    snap: boolean,
  ) {
    if (this.activeHandle < 0 || !this.target || !this.primitiveType) return

    const point = this.intersectPlane(target, clientX, clientY, this.dragPlane)
    if (!point) return

    if (snap) {
      point.x = snapValue(point.x)
      point.y = snapValue(point.y)
      point.z = snapValue(point.z)
    }

    let next = boundsFromPoints(this.anchorCorner, point)
    next = clampBounds(next)
    this.bounds = next
    refitMeshToBounds(this.target, this.primitiveType, next)
    this.syncVisuals()
    this.onRefit?.()
  }

  pointerUp() {
    if (this.activeHandle < 0) return
    this.handles[this.activeHandle].material = this.handleMaterial
    this.activeHandle = -1
    this.onDraggingChange?.(false)
  }

  private pickHandle(target: BoxGizmoPointerTarget, clientX: number, clientY: number): number {
    const objects: Object3D[] = this.handles
    this.setRayFromPointer(target, clientX, clientY)
    const hits = raycaster.intersectObjects(objects, false)
    if (!hits.length) return -1
    return (hits[0].object.userData.handleIndex as number) ?? -1
  }

  private intersectPlane(
    target: BoxGizmoPointerTarget,
    clientX: number,
    clientY: number,
    plane: Plane,
  ): Vector3 | null {
    this.setRayFromPointer(target, clientX, clientY)
    return raycaster.ray.intersectPlane(plane, hit)?.clone() ?? null
  }

  private setRayFromPointer(target: BoxGizmoPointerTarget, clientX: number, clientY: number) {
    const rect = target.element.getBoundingClientRect()
    ndc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, target.camera)
  }
}

function snapValue(value: number) {
  return Math.round(value / GRID) * GRID
}

function clampBounds(bounds: BoxBounds): BoxBounds {
  const min = bounds.min.clone()
  const max = bounds.max.clone()
  if (max.x - min.x < MIN_SIZE) max.x = min.x + MIN_SIZE
  if (max.y - min.y < MIN_SIZE) max.y = min.y + MIN_SIZE
  if (max.z - min.z < MIN_SIZE) max.z = min.z + MIN_SIZE
  return { min, max }
}

let gizmoInstance: BoxBoundsGizmo | null = null

export function initBoxBoundsGizmo(scene: { add: (o: Object3D) => void }) {
  gizmoInstance?.dispose()
  gizmoInstance = new BoxBoundsGizmo()
  scene.add(gizmoInstance.root)
  return gizmoInstance
}

export function getBoxBoundsGizmo() {
  return gizmoInstance
}
