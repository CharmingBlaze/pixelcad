import {
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Camera,
} from 'three'
import type { ViewportConfig } from './types'

export const VIEWPORT_CONFIGS: ViewportConfig[] = [
  { id: 'top', label: 'TOP', ortho: true, eye: [0, 20, 0], up: [0, 0, -1] },
  { id: 'persp', label: 'PERSPECTIVE', ortho: false, eye: [5, 4, 7], up: [0, 1, 0] },
  { id: 'front', label: 'FRONT', ortho: true, eye: [0, 0, 20], up: [0, 1, 0] },
  { id: 'side', label: 'SIDE', ortho: true, eye: [20, 0, 0], up: [0, 1, 0] },
]

export function createCamera(config: ViewportConfig): Camera {
  if (config.ortho) {
    const cam = new OrthographicCamera(-8, 8, 8, -8, 0.01, 200)
    cam.zoom = 1
    cam.position.set(...config.eye)
    cam.up.set(...config.up)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
    return cam
  }
  const cam = new PerspectiveCamera(50, 1, 0.01, 500)
  cam.position.set(...config.eye)
  cam.up.set(...config.up)
  cam.lookAt(0, 0, 0)
  return cam
}

export function updateOrthoAspect(cam: OrthographicCamera, aspect: number) {
  const halfHeight = 8
  cam.left = -halfHeight * aspect
  cam.right = halfHeight * aspect
  cam.top = 8
  cam.bottom = -8
  cam.updateProjectionMatrix()
}

export function updatePerspAspect(cam: PerspectiveCamera, aspect: number) {
  cam.aspect = aspect
  cam.updateProjectionMatrix()
}

export interface ViewportInteraction {
  orbitTarget: Vector3
  mouseDown: boolean
  btn: number
  lastX: number
  lastY: number
  dragDist: number
}

export function createInteraction(): ViewportInteraction {
  return {
    orbitTarget: new Vector3(),
    mouseDown: false,
    btn: -1,
    lastX: 0,
    lastY: 0,
    dragDist: 0,
  }
}
