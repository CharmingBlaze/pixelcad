import { Box3, Mesh, Vector3 } from 'three'
import { createPrimitiveInBox, type BoxBounds } from './geometry'
import type { PrimitiveType } from './types'

export type StoredBounds = {
  min: [number, number, number]
  max: [number, number, number]
}

export const CORNER_OPPOSITE = [6, 7, 4, 5, 2, 3, 0, 1] as const

export function serializeBounds(bounds: BoxBounds): StoredBounds {
  return {
    min: [bounds.min.x, bounds.min.y, bounds.min.z],
    max: [bounds.max.x, bounds.max.y, bounds.max.z],
  }
}

export function deserializeBounds(data: StoredBounds): BoxBounds {
  return {
    min: new Vector3(...data.min),
    max: new Vector3(...data.max),
  }
}

export function boundsFromPoints(a: Vector3, b: Vector3): BoxBounds {
  return {
    min: new Vector3(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.min(a.z, b.z),
    ),
    max: new Vector3(
      Math.max(a.x, b.x),
      Math.max(a.y, b.y),
      Math.max(a.z, b.z),
    ),
  }
}

export function cornerPoints(bounds: BoxBounds): Vector3[] {
  const { min, max } = bounds
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z),
  ]
}

export function getMeshFitBounds(mesh: Mesh): BoxBounds {
  const stored = mesh.userData.fitBounds as StoredBounds | undefined
  if (stored?.min && stored?.max) return deserializeBounds(stored)

  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  if (!bb) {
    const p = mesh.getWorldPosition(new Vector3())
    return { min: p.clone(), max: p.clone().add(new Vector3(1, 1, 1)) }
  }

  const world = new Box3().copy(bb).applyMatrix4(mesh.matrixWorld)
  return { min: world.min.clone(), max: world.max.clone() }
}

export function storeMeshFitBounds(mesh: Mesh, bounds: BoxBounds) {
  mesh.userData.fitBounds = serializeBounds(bounds)
}

export function refitMeshToBounds(mesh: Mesh, type: PrimitiveType, bounds: BoxBounds) {
  const next = createPrimitiveInBox(type, bounds.min, bounds.max)
  mesh.geometry.dispose()
  mesh.geometry = next
  mesh.position.set(0, 0, 0)
  mesh.rotation.set(0, 0, 0)
  mesh.scale.set(1, 1, 1)
  mesh.updateMatrixWorld(true)
  storeMeshFitBounds(mesh, bounds)
}

export function meshSupportsBoxHandles(mesh: Mesh): boolean {
  return !!(mesh.userData.type as PrimitiveType | undefined)
}
