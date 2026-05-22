import {
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'
import type { ViewportRuntime } from './viewportRuntime'

const raycaster = new Raycaster()
const ndc = new Vector2()
const planeNormal = new Vector3()
const hitPoint = new Vector3()
const towardCamera = new Vector3()

function setPointerRay(camera: Camera, element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false

  camera.updateMatrixWorld(true)
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(ndc, camera)
  return true
}

function pointerRay(vp: ViewportRuntime, clientX: number, clientY: number) {
  if (!setPointerRay(vp.camera, vp.el, clientX, clientY)) return null
  return raycaster.ray
}

function dropOffsetDistance(vp: ViewportRuntime, worldPoint: Vector3): number {
  if (vp.camera instanceof OrthographicCamera) return 0.4
  if (vp.camera instanceof PerspectiveCamera) {
    const dist = vp.camera.position.distanceTo(worldPoint)
    return Math.max(0.2, dist * 0.025)
  }
  return 0.35
}

function nudgeTowardCamera(vp: ViewportRuntime, point: Vector3, distance: number): Vector3 {
  vp.camera.getWorldDirection(towardCamera)
  return point.clone().add(towardCamera.multiplyScalar(-distance))
}

export function worldPointOnCameraPlane(
  camera: Camera,
  element: HTMLElement,
  clientX: number,
  clientY: number,
  anchorWorld: Vector3,
): Vector3 | null {
  if (!setPointerRay(camera, element, clientX, clientY)) return null

  const plane = new Plane().setFromNormalAndCoplanarPoint(
    camera.getWorldDirection(planeNormal).normalize(),
    anchorWorld,
  )
  return raycaster.ray.intersectPlane(plane, hitPoint) ? hitPoint.clone() : null
}

export function worldPointOnViewportPlane(
  vp: ViewportRuntime,
  clientX: number,
  clientY: number,
  anchorWorld = vp.interaction.orbitTarget,
): Vector3 | null {
  return worldPointOnCameraPlane(vp.camera, vp.el, clientX, clientY, anchorWorld)
}

export function worldPointForReferenceImageDrop(
  vp: ViewportRuntime,
  clientX: number,
  clientY: number,
  occluders: Object3D[],
): Vector3 | null {
  const ray = pointerRay(vp, clientX, clientY)
  if (!ray) return null

  const planePoint = worldPointOnViewportPlane(vp, clientX, clientY)
  const hits = occluders.length > 0 ? raycaster.intersectObjects(occluders, false) : []
  const base = hits.length > 0 ? hits[0].point : planePoint
  if (!base) return null

  return nudgeTowardCamera(vp, base, dropOffsetDistance(vp, base))
}
