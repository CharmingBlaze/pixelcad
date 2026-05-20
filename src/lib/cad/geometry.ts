import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from 'three'
import type { PolyDrawSpace, PrimitiveType } from './types'

type RefNormal = (a: Vector3, b: Vector3, c: Vector3) => Vector3

function geometry(positions: number[], indices: number[], refNormal?: RefNormal): BufferGeometry {
  const oriented: number[] = []
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]
    const ib = indices[i + 1]
    const ic = indices[i + 2]
    const a = point(positions, ia)
    const b = point(positions, ib)
    const c = point(positions, ic)
    const normal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
    const ref = refNormal ? refNormal(a, b, c) : a.clone().add(b).add(c).multiplyScalar(1 / 3)
    if (normal.dot(ref) < 0) oriented.push(ia, ic, ib)
    else oriented.push(ia, ib, ic)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(oriented)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

function point(positions: number[], index: number): Vector3 {
  return new Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2])
}

function push(positions: number[], x: number, y: number, z: number): number {
  const index = positions.length / 3
  positions.push(x, y, z)
  return index
}

function ring(positions: number[], radius: number, y: number, segments: number): number[] {
  const ids: number[] = []
  for (let i = 0; i < segments; i++) {
    const t = (Math.PI * 2 * i) / segments
    ids.push(push(positions, Math.cos(t) * radius, y, Math.sin(t) * radius))
  }
  return ids
}

export function lowPolyCube(): BufferGeometry {
  const s = 0.7
  const p = [
    -s, -s, -s,  s, -s, -s,  s,  s, -s, -s,  s, -s,
    -s, -s,  s,  s, -s,  s,  s,  s,  s, -s,  s,  s,
  ]
  const i = [
    4, 5, 6, 4, 6, 7, // front
    1, 0, 3, 1, 3, 2, // back
    0, 4, 7, 0, 7, 3, // left
    5, 1, 2, 5, 2, 6, // right
    3, 7, 6, 3, 6, 2, // top
    0, 1, 5, 0, 5, 4, // bottom
  ]
  return geometry(p, i)
}

export function lowPolyPyramid(): BufferGeometry {
  const s = 0.8
  const h = 1.45
  const p = [
    -s, -h / 2, -s,
     s, -h / 2, -s,
     s, -h / 2,  s,
    -s, -h / 2,  s,
     0,  h / 2,  0,
  ]
  const i = [
    0, 1, 2, 0, 2, 3,
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0,
  ]
  return geometry(p, i)
}

export function lowPolyCylinder(segments = 8): BufferGeometry {
  const p: number[] = []
  const r = 0.72
  const h = 1.4
  const bottom = ring(p, r, -h / 2, segments)
  const top = ring(p, r, h / 2, segments)
  const bottomCenter = push(p, 0, -h / 2, 0)
  const topCenter = push(p, 0, h / 2, 0)
  const idx: number[] = []

  for (let n = 0; n < segments; n++) {
    const next = (n + 1) % segments
    idx.push(bottom[n], bottom[next], top[next], bottom[n], top[next], top[n])
    idx.push(topCenter, top[n], top[next])
    idx.push(bottomCenter, bottom[next], bottom[n])
  }
  return geometry(p, idx)
}

export function lowPolyCone(segments = 8): BufferGeometry {
  const p: number[] = []
  const r = 0.78
  const h = 1.45
  const base = ring(p, r, -h / 2, segments)
  const center = push(p, 0, -h / 2, 0)
  const tip = push(p, 0, h / 2, 0)
  const idx: number[] = []

  for (let n = 0; n < segments; n++) {
    const next = (n + 1) % segments
    idx.push(base[n], base[next], tip)
    idx.push(center, base[next], base[n])
  }
  return geometry(p, idx)
}

export function lowPolySphere(rows = 5, cols = 8): BufferGeometry {
  const p: number[] = []
  const idx: number[] = []
  const top = push(p, 0, 0.8, 0)
  const rings: number[][] = []

  for (let r = 1; r < rows; r++) {
    const phi = (Math.PI * r) / rows
    const y = Math.cos(phi) * 0.8
    const radius = Math.sin(phi) * 0.8
    rings.push(ring(p, radius, y, cols))
  }
  const bottom = push(p, 0, -0.8, 0)

  for (let c = 0; c < cols; c++) {
    idx.push(top, rings[0][c], rings[0][(c + 1) % cols])
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = rings[r][c]
      const b = rings[r][(c + 1) % cols]
      const d = rings[r + 1][c]
      const e = rings[r + 1][(c + 1) % cols]
      idx.push(a, d, e, a, e, b)
    }
  }
  const last = rings[rings.length - 1]
  for (let c = 0; c < cols; c++) {
    idx.push(bottom, last[(c + 1) % cols], last[c])
  }
  return geometry(p, idx)
}

export function lowPolyTorus(segments = 8, tube = 6): BufferGeometry {
  const p: number[] = []
  const idx: number[] = []
  const major = 0.62
  const minor = 0.23

  for (let i = 0; i < segments; i++) {
    const u = (Math.PI * 2 * i) / segments
    for (let j = 0; j < tube; j++) {
      const v = (Math.PI * 2 * j) / tube
      push(
        p,
        (major + minor * Math.cos(v)) * Math.cos(u),
        minor * Math.sin(v),
        (major + minor * Math.cos(v)) * Math.sin(u),
      )
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * tube + j
      const b = i * tube + ((j + 1) % tube)
      const c = ((i + 1) % segments) * tube + j
      const d = ((i + 1) % segments) * tube + ((j + 1) % tube)
      idx.push(a, c, d, a, d, b)
    }
  }

  return geometry(p, idx, (a, b, c) => {
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3)
    const tubeCenter = new Vector3(center.x, 0, center.z).normalize().multiplyScalar(major)
    return center.sub(tubeCenter)
  })
}

export function lowPolyPlane(): BufferGeometry {
  const s = 1
  const p = [-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s]
  const idx = [0, 3, 2, 0, 2, 1]
  return geometry(p, idx, () => new Vector3(0, 1, 0))
}

export interface BoxBounds {
  min: Vector3
  max: Vector3
}

export function createPrimitiveInBox(
  type: PrimitiveType,
  min: Vector3,
  max: Vector3,
): BufferGeometry {
  const size = new Vector3().subVectors(max, min)
  const center = new Vector3().addVectors(min, max).multiplyScalar(0.5)

  if (type === 'plane') {
    const geo = lowPolyPlane()
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    const srcCenter = bb.getCenter(new Vector3())
    const srcSize = bb.getSize(new Vector3())
    geo.translate(-srcCenter.x, -srcCenter.y, -srcCenter.z)
    geo.scale(
      Math.max(size.x, MIN_BASE) / srcSize.x,
      1,
      Math.max(size.z, MIN_BASE) / srcSize.z,
    )
    geo.translate(center.x, min.y, center.z)
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }

  const geo = geoForType(type).clone()
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const srcCenter = bb.getCenter(new Vector3())
  const srcSize = bb.getSize(new Vector3())
  geo.translate(-srcCenter.x, -srcCenter.y, -srcCenter.z)
  geo.scale(
    Math.max(size.x, MIN_BASE) / srcSize.x,
    Math.max(size.y, MIN_BASE) / srcSize.y,
    Math.max(size.z, MIN_BASE) / srcSize.z,
  )
  geo.translate(center.x, center.y, center.z)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

const MIN_BASE = 0.08

export function createPolygonGeometry(
  vertices: Vector3[],
  indices: number[],
  space: PolyDrawSpace = '2d',
): BufferGeometry {
  const positions: number[] = []
  for (const v of vertices) positions.push(v.x, v.y, v.z)
  const normal = polygonRefNormal(vertices, space)
  return geometry(positions, indices, () => normal)
}

function polygonRefNormal(vertices: Vector3[], space: PolyDrawSpace): Vector3 {
  if (space === '2d') return new Vector3(0, 1, 0)

  let normal = polygonNormal(vertices)
  if (vertices.length >= 3) {
    const a = vertices[0]
    const b = vertices[1]
    const c = vertices[2]
    const triNormal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
    if (triNormal.lengthSq() > 1e-10 && triNormal.dot(normal) < 0) normal = normal.negate()
  }
  return normal
}

function polygonNormal(vertices: Vector3[]): Vector3 {
  if (vertices.length < 3) return new Vector3(0, 1, 0)
  const normal = new Vector3()
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]
    const next = vertices[(i + 1) % vertices.length]
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }
  if (normal.lengthSq() <= 0.000001) return new Vector3(0, 1, 0)
  return normal.normalize()
}

export function geoForType(type: PrimitiveType): BufferGeometry {
  switch (type) {
    case 'box':
      return lowPolyCube()
    case 'sphere':
      return lowPolySphere()
    case 'cylinder':
      return lowPolyCylinder()
    case 'cone':
      return lowPolyCone()
    case 'pyramid':
      return lowPolyPyramid()
    case 'torus':
      return lowPolyTorus()
    case 'plane':
      return lowPolyPlane()
    case 'polygon':
      return lowPolyPlane()
    default:
      return lowPolyCube()
  }
}
