import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  ShapeUtils,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
} from 'three'
import { createPolygonGeometry } from './geometry'
import type { PolyDrawMode, PolyDrawSpace } from './types'

const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const GRID = 0.5
const CLOSE_RADIUS_2D = 0.45
const CLOSE_RADIUS_3D = 0.35
const VERTEX_SNAP_PX = 24
const VERTEX_KEY_EPS = 0.002
const SAME_VERTEX_EPS = 0.015

const raycaster = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()
const worldPoint = new Vector3()
const projected = new Vector3()

export interface PolyDrawPointerTarget {
  camera: Camera
  element: HTMLElement
  sceneMeshes: Mesh[]
}

export interface PolyDrawSettings {
  space: PolyDrawSpace
  surface: boolean
  snap: boolean
}

type SnapSource = 'scene' | 'stroke' | 'close'

interface SnapHit {
  position: Vector3
  source: SnapSource
}

export class PolyDrawTool {
  mode: PolyDrawMode | null = null
  vertices: Vector3[] = []
  cursorPoint: Vector3 | null = null
  snapHit: SnapHit | null = null
  closeHover = false

  private scene: Scene | null = null
  private readonly root = new Group()
  private readonly lineMesh: LineSegments
  private readonly snapLineMesh: LineSegments
  private readonly fillMesh: Mesh
  private readonly normalPointMat = new MeshBasicMaterial({ color: 0xffee88, toneMapped: false })
  private readonly closePointMat = new MeshBasicMaterial({ color: 0x66ff99, toneMapped: false })
  private readonly snapSceneMat = new MeshBasicMaterial({ color: 0xffaa44, toneMapped: false })
  private readonly snapStrokeMat = new MeshBasicMaterial({ color: 0xffee88, toneMapped: false })
  private readonly snapRingMat = new MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly pointGeo: BufferGeometry
  private readonly pointMeshes: Mesh[] = []
  private snapCore: Mesh | null = null
  private snapRing: Mesh | null = null

  constructor() {
    this.lineMesh = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0x9ed0ff, toneMapped: false }),
    )
    this.snapLineMesh = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0xffaa44, toneMapped: false }),
    )
    this.fillMesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: 0x4191ff,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    )
    this.pointGeo = new BufferGeometry()
    this.pointGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    this.root.add(this.lineMesh, this.snapLineMesh, this.fillMesh)
    this.root.visible = false
  }

  attachScene(scene: Scene) {
    this.scene = scene
    scene.add(this.root)
  }

  detachScene() {
    this.clearPointMeshes()
    this.clearSnapMarker()
    this.pointGeo.dispose()
    this.root.removeFromParent()
    this.scene = null
  }

  start(mode: PolyDrawMode) {
    this.cancel()
    this.mode = mode
    this.root.visible = false
  }

  cancel() {
    this.mode = null
    this.vertices = []
    this.cursorPoint = null
    this.snapHit = null
    this.closeHover = false
    this.clearPointMeshes()
    this.clearSnapMarker()
    this.root.visible = false
  }

  isActive() {
    return this.mode !== null
  }

  maxVertices(): number | null {
    if (this.mode === 'triangle') return 3
    if (this.mode === 'quad') return 4
    return null
  }

  statusText(settings?: Pick<PolyDrawSettings, 'space' | 'surface'> & { mergeTarget?: string }): string {
    if (!this.mode) return ''
    const n = this.vertices.length
    const max = this.maxVertices()
    const placement = settings
      ? `${settings.space.toUpperCase()}${settings.surface ? ' · Surface' : ''}`
      : '2D/3D'
    const mergeHint = settings?.mergeTarget ? ` → ${settings.mergeTarget}` : ''

    if (this.snapHit) {
      const label =
        this.snapHit.source === 'close'
          ? 'close shape'
          : this.snapHit.source === 'scene'
            ? 'existing vertex'
            : 'stroke vertex'
      return `Poly Draw${mergeHint}: snap to ${label} — click to connect`
    }

    if (this.mode === 'triangle') {
      return `Triangle (${placement})${mergeHint}: click ${3 - n} more corner${3 - n === 1 ? '' : 's'} — hover verts to snap`
    }
    if (this.mode === 'quad') {
      return `Quad (${placement})${mergeHint}: click ${4 - n} more corner${4 - n === 1 ? '' : 's'} — hover verts to snap`
    }
    if (n < 3) {
      return `Poly (${placement})${mergeHint}: click ${3 - n} more point${3 - n === 1 ? '' : 's'} — hover any vertex to snap`
    }
    return `Poly (${placement})${mergeHint}: click next point, snap to any vertex, or click first point to close`
  }

  handleClick(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    settings: PolyDrawSettings,
  ) {
    if (!this.mode) return false
    const resolved = this.resolvePointer(target, clientX, clientY, settings)
    if (!resolved.point) return true

    const point = resolved.point

    if (
      this.mode === 'poly' &&
      this.vertices.length >= 3 &&
      (resolved.closeTarget || this.nearPoint(point, this.vertices[0], settings.space))
    ) {
      this.commit(settings.space)
      return true
    }

    const max = this.maxVertices()
    if (max !== null && this.vertices.length >= max) return true

    if (
      this.vertices.length > 0 &&
      this.sameVertex(point, this.vertices[this.vertices.length - 1], settings.space)
    ) {
      return true
    }

    this.vertices.push(point)
    this.cursorPoint = point.clone()

    if (max !== null && this.vertices.length >= max) {
      this.commit(settings.space)
      return true
    }

    this.updatePreview(settings.space)
    return true
  }

  handleMove(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    settings: PolyDrawSettings,
  ) {
    if (!this.mode) return
    const resolved = this.resolvePointer(target, clientX, clientY, settings)
    if (!resolved.point) return

    this.snapHit = resolved.snapHit
    this.cursorPoint = resolved.point
    this.closeHover =
      this.mode === 'poly' &&
      this.vertices.length >= 3 &&
      (resolved.closeTarget ||
        this.nearPoint(resolved.point, this.vertices[0], settings.space) ||
        resolved.snapHit?.source === 'close')

    this.updatePreview(settings.space)
  }

  onCommit:
    | ((vertices: Vector3[], indices: number[], mode: PolyDrawMode, space: PolyDrawSpace) => void)
    | null = null

  private commit(space: PolyDrawSpace) {
    if (!this.mode || this.vertices.length < 3) return
    const indices = triangulatePolygon(this.vertices, this.mode, space)
    if (!indices.length) {
      this.cancel()
      return
    }
    const verts = this.vertices.map((v) => v.clone())
    const mode = this.mode
    this.cancel()
    this.onCommit?.(verts, indices, mode, space)
  }

  private updatePreview(space: PolyDrawSpace) {
    if (!this.mode) {
      this.root.visible = false
      return
    }

    this.syncPointMeshes()
    this.syncSnapMarker()
    this.syncSnapLine()

    const previewVerts = [...this.vertices]
    if (this.cursorPoint && (this.mode === 'poly' || previewVerts.length < (this.maxVertices() ?? Infinity))) {
      previewVerts.push(this.cursorPoint)
    }

    if (previewVerts.length === 0 && !this.snapHit) {
      this.root.visible = false
      return
    }

    this.root.visible = true
    this.updateLines(previewVerts)

    const fillVerts = this.fillVertices(previewVerts)
    if (fillVerts.length >= 3) {
      const fillMode =
        this.mode === 'poly' && this.vertices.length >= 3 ? 'poly' : this.mode ?? 'poly'
      const fillIndices = triangulatePolygon(fillVerts, fillMode, space)
      if (fillIndices.length >= 3) {
        this.fillMesh.geometry.dispose()
        this.fillMesh.geometry = createPolygonGeometry(fillVerts, fillIndices, space)
        this.fillMesh.visible = true
      } else {
        this.fillMesh.visible = false
      }
    } else {
      this.fillMesh.visible = false
    }
  }

  private fillVertices(previewVerts: Vector3[]): Vector3[] {
    if (this.mode === 'poly' && this.vertices.length >= 3) return [...this.vertices]
    if (this.mode === 'poly' && this.closeHover) return [...this.vertices]
    if (previewVerts.length >= 3) return previewVerts.slice(0, -1)
    return previewVerts
  }

  private updateLines(points: Vector3[]) {
    if (points.length < 2) {
      this.lineMesh.visible = false
      return
    }

    const positions: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
      positions.push(points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z)
    }

    if (this.mode === 'poly' && this.vertices.length >= 3 && this.closeHover) {
      const first = this.vertices[0]
      const last = points[points.length - 1]
      positions.push(last.x, last.y, last.z, first.x, first.y, first.z)
    }

    this.lineMesh.geometry.dispose()
    this.lineMesh.geometry = new BufferGeometry()
    this.lineMesh.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.lineMesh.visible = true
  }

  private syncSnapLine() {
    if (!this.snapHit || this.vertices.length === 0) {
      this.snapLineMesh.visible = false
      return
    }

    const last = this.vertices[this.vertices.length - 1]
    const target = this.snapHit.position
    this.snapLineMesh.geometry.dispose()
    this.snapLineMesh.geometry = new BufferGeometry()
    this.snapLineMesh.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [last.x, last.y, last.z, target.x, target.y, target.z],
        3,
      ),
    )
    this.snapLineMesh.visible = true
  }

  private syncPointMeshes() {
    this.clearPointMeshes()

    this.vertices.forEach((v, i) => {
      const mat = this.mode === 'poly' && i === 0 && this.closeHover ? this.closePointMat : this.normalPointMat
      const m = new Mesh(this.pointGeo, mat)
      m.position.copy(v)
      m.scale.setScalar(i === 0 && this.closeHover ? 0.14 : 0.1)
      m.renderOrder = 10
      this.pointMeshes.push(m)
      this.root.add(m)
    })
  }

  private syncSnapMarker() {
    if (!this.snapHit) {
      this.clearSnapMarker()
      return
    }

    const pos = this.snapHit.position
    const isClose = this.snapHit.source === 'close'

    if (!this.snapCore) {
      this.snapCore = new Mesh(this.pointGeo, this.snapSceneMat)
      this.snapCore.renderOrder = 12
      this.root.add(this.snapCore)
    }
    if (!this.snapRing) {
      this.snapRing = new Mesh(this.pointGeo, this.snapRingMat)
      this.snapRing.renderOrder = 11
      this.root.add(this.snapRing)
    }

    const coreMat =
      isClose ? this.closePointMat : this.snapHit.source === 'scene' ? this.snapSceneMat : this.snapStrokeMat
    this.snapCore.material = coreMat
    this.snapCore.position.copy(pos)
    this.snapCore.scale.setScalar(isClose ? 0.15 : 0.12)
    this.snapCore.visible = true

    this.snapRing.position.copy(pos)
    this.snapRing.scale.setScalar(isClose ? 0.22 : 0.2)
    this.snapRing.visible = true
  }

  private clearPointMeshes() {
    for (const m of this.pointMeshes) {
      this.root.remove(m)
    }
    this.pointMeshes.length = 0
  }

  private clearSnapMarker() {
    if (this.snapCore) {
      this.root.remove(this.snapCore)
      this.snapCore = null
    }
    if (this.snapRing) {
      this.root.remove(this.snapRing)
      this.snapRing = null
    }
    this.snapLineMesh.visible = false
  }

  private nearPoint(a: Vector3, b: Vector3, space: PolyDrawSpace) {
    return this.sameVertex(a, b, space, space === '2d' ? CLOSE_RADIUS_2D : CLOSE_RADIUS_3D)
  }

  private sameVertex(a: Vector3, b: Vector3, space: PolyDrawSpace, epsilon = SAME_VERTEX_EPS) {
    if (space === '2d') {
      const dx = a.x - b.x
      const dz = a.z - b.z
      return dx * dx + dz * dz <= epsilon * epsilon
    }
    return a.distanceToSquared(b) <= epsilon * epsilon
  }

  private resolvePointer(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    settings: PolyDrawSettings,
  ): { point: Vector3 | null; snapHit: SnapHit | null; closeTarget: boolean } {
    this.setRayFromPointer(target, clientX, clientY)

    const candidates = this.collectSnapCandidates(target.sceneMeshes)
    const snap = this.findSnapVertex(target, clientX, clientY, candidates, settings.space)

    if (snap) {
      const closeTarget =
        this.mode === 'poly' &&
        this.vertices.length >= 3 &&
        this.sameVertex(snap.position, this.vertices[0], settings.space)
      return { point: snap.position.clone(), snapHit: snap, closeTarget }
    }

    const surfaceHit = settings.surface ? this.raycastSurface(target.sceneMeshes) : null
    if (surfaceHit) {
      if (settings.space === '2d') surfaceHit.y = 0
      return {
        point: this.applyGridSnap(surfaceHit, settings.snap, settings.space),
        snapHit: null,
        closeTarget: false,
      }
    }

    if (settings.space === '2d') {
      const ground = this.pointerOnGround(settings.snap)
      return { point: ground, snapHit: null, closeTarget: false }
    }

    const plane = this.pointerOnCameraPlane(target.camera, settings.snap)
    return { point: plane, snapHit: null, closeTarget: false }
  }

  private setRayFromPointer(target: PolyDrawPointerTarget, clientX: number, clientY: number) {
    const rect = target.element.getBoundingClientRect()
    ndc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, target.camera)
  }

  private collectSnapCandidates(sceneMeshes: Mesh[]): SnapHit[] {
    const seen = new Set<string>()
    const candidates: SnapHit[] = []

    const addCandidate = (position: Vector3, source: SnapSource) => {
      const key = this.vertexKey(position)
      if (seen.has(key)) return
      seen.add(key)
      candidates.push({ position: position.clone(), source })
    }

    for (const v of this.vertices) {
      addCandidate(v, 'stroke')
    }

    if (this.mode === 'poly' && this.vertices.length >= 3) {
      addCandidate(this.vertices[0], 'close')
    }

    for (const mesh of sceneMeshes) {
      const pos = mesh.geometry.attributes.position
      if (!pos) continue
      mesh.updateMatrixWorld(true)
      for (let i = 0; i < pos.count; i++) {
        worldPoint.fromBufferAttribute(pos, i)
        mesh.localToWorld(worldPoint)
        addCandidate(worldPoint, 'scene')
      }
    }

    return candidates
  }

  private findSnapVertex(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    candidates: SnapHit[],
    space: PolyDrawSpace,
  ): SnapHit | null {
    const rect = target.element.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const radiusSq = VERTEX_SNAP_PX * VERTEX_SNAP_PX

    let best: SnapHit | null = null
    let bestDist = radiusSq

    for (const candidate of candidates) {
      const display = candidate.position.clone()
      if (space === '2d') display.y = 0

      projected.copy(display).project(target.camera)
      if (projected.z > 1) continue
      const sx = (projected.x * 0.5 + 0.5) * rect.width
      const sy = (-projected.y * 0.5 + 0.5) * rect.height
      const dx = sx - localX
      const dy = sy - localY
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = {
          position: display,
          source: candidate.source,
        }
      }
    }

    return best
  }

  private vertexKey(v: Vector3): string {
    const q = (n: number) => Math.round(n / VERTEX_KEY_EPS)
    return `${q(v.x)}_${q(v.y)}_${q(v.z)}`
  }

  private raycastSurface(sceneMeshes: Mesh[]): Vector3 | null {
    if (!sceneMeshes.length) return null
    const hits = raycaster.intersectObjects(sceneMeshes, false)
    if (!hits.length) return null
    return hits[0].point.clone()
  }

  private pointerOnGround(snap: boolean): Vector3 | null {
    const p = raycaster.ray.intersectPlane(GROUND, hit)?.clone()
    if (!p) return null
    p.y = 0
    return this.applyGridSnap(p, snap, '2d')
  }

  private pointerOnCameraPlane(camera: Camera, snap: boolean): Vector3 | null {
    const anchor = this.vertices.length ? this.vertices[this.vertices.length - 1] : new Vector3(0, 0, 0)
    const normal = camera.getWorldDirection(new Vector3()).normalize()
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, anchor)
    const p = raycaster.ray.intersectPlane(plane, hit)?.clone()
    if (!p) return null
    return this.applyGridSnap(p, snap, '3d')
  }

  private applyGridSnap(point: Vector3, snap: boolean, space: PolyDrawSpace): Vector3 {
    if (!snap) return point
    point.x = snapValue(point.x)
    if (space === '3d') point.y = snapValue(point.y)
    else point.y = 0
    point.z = snapValue(point.z)
    return point
  }
}

export function triangulatePolygon(
  vertices: Vector3[],
  mode: PolyDrawMode,
  space: PolyDrawSpace = '2d',
): number[] {
  if (vertices.length < 3) return []
  if (mode === 'triangle' && vertices.length >= 3) return [0, 1, 2]
  if (mode === 'quad' && vertices.length >= 4) return [0, 1, 2, 0, 2, 3]
  if (vertices.length === 3) return [0, 1, 2]

  const contour =
    space === '3d'
      ? projectVerticesToPlane(vertices)
      : vertices.map((v) => new Vector2(v.x, v.z))

  try {
    return ShapeUtils.triangulateShape(contour, []).flat()
  } catch {
    const indices: number[] = []
    for (let i = 1; i < vertices.length - 1; i++) indices.push(0, i, i + 1)
    return indices
  }
}

function projectVerticesToPlane(vertices: Vector3[]): Vector2[] {
  const normal = newellNormal(vertices)
  const tangent = new Vector3()
  if (Math.abs(normal.y) < 0.9) tangent.set(0, 1, 0)
  else tangent.set(1, 0, 0)
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize()
  tangent.crossVectors(bitangent, normal).normalize()

  const origin = vertices[0]
  return vertices.map((vertex) => {
    const delta = vertex.clone().sub(origin)
    return new Vector2(delta.dot(tangent), delta.dot(bitangent))
  })
}

function newellNormal(vertices: Vector3[]): Vector3 {
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

function snapValue(value: number) {
  return Math.round(value / GRID) * GRID
}

let toolInstance: PolyDrawTool | null = null

export function initPolyDrawTool(scene: Scene) {
  toolInstance?.detachScene()
  toolInstance = new PolyDrawTool()
  toolInstance.attachScene(scene)
  return toolInstance
}

export function getPolyDrawTool() {
  return toolInstance
}
