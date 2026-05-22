import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
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
import { GIZMO_ACTIVE } from './gizmoTheme'
import type { PolyDrawMode, PolyDrawSpace } from './types'
import { worldPointOnCameraPlane } from './viewportPick'

const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const GRID = 0.5
const CLOSE_RADIUS_2D = 0.45
const CLOSE_RADIUS_3D = 0.35
const VERTEX_SNAP_PX = 34
const VERTEX_HOVER_PX = 56
const VERTEX_KEY_EPS = 0.002
const SAME_VERTEX_EPS = 0.015
const SCENE_VERTEX_SCALE = 0.055
const STROKE_VERTEX_SCALE = 0.095
const STROKE_ACTIVE_SCALE = 0.115
const SNAP_CORE_SCALE = 0.13
const HOVER_RING_SCALE = 0.19
const SNAP_RING_SCALE = 0.24

const raycaster = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()
const worldPoint = new Vector3()
const projected = new Vector3()
const instanceMatrix = new Matrix4()

export interface PolyDrawPointerTarget {
  camera: Camera
  element: HTMLElement
  sceneMeshes: Mesh[]
  orbitTarget: Vector3
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
  strokeIndex?: number
}

export class PolyDrawTool {
  mode: PolyDrawMode | null = null
  vertices: Vector3[] = []
  cursorPoint: Vector3 | null = null
  snapHit: SnapHit | null = null
  hoverHit: SnapHit | null = null
  closeHover = false
  strokeSpace: PolyDrawSpace | null = null

  private scene: Scene | null = null
  private readonly root = new Group()
  private readonly lineMesh: LineSegments
  private readonly snapLineMesh: LineSegments
  private readonly fillMesh: Mesh
  private readonly strokePointMat = new MeshBasicMaterial({ color: GIZMO_ACTIVE, toneMapped: false })
  private readonly strokeActiveMat = new MeshBasicMaterial({ color: 0xfff0a8, toneMapped: false })
  private readonly closePointMat = new MeshBasicMaterial({ color: 0x66ff99, toneMapped: false })
  private readonly sceneVertexMat = new MeshBasicMaterial({
    color: 0x9eb4cc,
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
  })
  private readonly snapSceneMat = new MeshBasicMaterial({ color: GIZMO_ACTIVE, toneMapped: false })
  private readonly snapStrokeMat = new MeshBasicMaterial({ color: 0xfff0a8, toneMapped: false })
  private readonly hoverRingMat = new MeshBasicMaterial({
    color: GIZMO_ACTIVE,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly snapRingMat = new MeshBasicMaterial({
    color: GIZMO_ACTIVE,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly pointGeo: BufferGeometry
  private readonly pointMeshes: Mesh[] = []
  private sceneVertexMesh: InstancedMesh | null = null
  private sceneVertexCapacity = 0
  private snapCore: Mesh | null = null
  private snapRing: Mesh | null = null
  private hoverRing: Mesh | null = null

  constructor() {
    this.lineMesh = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0x9ed0ff, toneMapped: false }),
    )
    this.snapLineMesh = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: GIZMO_ACTIVE, transparent: true, opacity: 1, toneMapped: false }),
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
    this.clearSceneVertexMarkers()
    this.clearSnapMarker()
    this.pointGeo.dispose()
    this.root.removeFromParent()
    this.scene = null
  }

  start(mode: PolyDrawMode) {
    this.clearStroke()
    this.mode = mode
    this.root.visible = false
  }

  cancel() {
    this.mode = null
    this.clearStroke()
  }

  private clearStroke() {
    this.vertices = []
    this.cursorPoint = null
    this.snapHit = null
    this.hoverHit = null
    this.closeHover = false
    this.strokeSpace = null
    this.clearPointMeshes()
    this.clearSceneVertexMarkers()
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
      ? `${(this.strokeSpace ?? settings.space).toUpperCase()}${settings.surface ? ' · Surface' : ''}`
      : '2D/3D'
    const mergeHint = settings?.mergeTarget ? ` → ${settings.mergeTarget}` : ''

    if (this.snapHit) {
      const label =
        this.snapHit.source === 'close'
          ? 'close shape'
          : this.snapHit.source === 'scene'
            ? 'mesh vertex'
            : this.snapHit.strokeIndex === this.vertices.length - 1
              ? 'stroke vertex'
              : 'continue stroke'
      return `Poly Draw${mergeHint}: snap to ${label} — click to connect`
    }

    if (this.hoverHit) {
      const label =
        this.hoverHit.source === 'scene'
          ? 'mesh vertex'
          : this.hoverHit.strokeIndex === this.vertices.length - 1
            ? 'stroke vertex'
            : 'continue stroke'
      return `Poly Draw${mergeHint}: near ${label} — move closer to snap`
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

    const space = this.placementSpace(settings, resolved.placementSpace)
    const point = resolved.point

    if (
      this.mode === 'poly' &&
      this.vertices.length >= 3 &&
      (resolved.closeTarget || this.nearPoint(point, this.vertices[0], space))
    ) {
      this.commit(space)
      return true
    }

    if (resolved.snapHit?.source === 'stroke' && resolved.snapHit.strokeIndex !== undefined) {
      const idx = resolved.snapHit.strokeIndex
      if (idx < this.vertices.length - 1) {
        this.vertices = this.vertices.slice(0, idx + 1)
        this.cursorPoint = this.vertices[idx].clone()
        this.strokeSpace = space
        this.updatePreview(space, target.sceneMeshes)
        return true
      }
      if (idx === this.vertices.length - 1) return true
    }

    const max = this.maxVertices()
    if (max !== null && this.vertices.length >= max) return true

    if (
      this.vertices.length > 0 &&
      this.sameVertex(point, this.vertices[this.vertices.length - 1], space)
    ) {
      return true
    }

    if (this.vertices.length === 0) this.strokeSpace = space

    this.vertices.push(point)
    this.cursorPoint = point.clone()

    if (max !== null && this.vertices.length >= max) {
      this.commit(space)
      return true
    }

    this.updatePreview(space, target.sceneMeshes)
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

    const space = this.placementSpace(settings, resolved.placementSpace)

    this.hoverHit = resolved.hoverHit
    this.snapHit = resolved.snapHit
    this.cursorPoint = resolved.point
    this.closeHover =
      this.mode === 'poly' &&
      this.vertices.length >= 3 &&
      (resolved.closeTarget ||
        this.nearPoint(resolved.point, this.vertices[0], space) ||
        resolved.snapHit?.source === 'close')

    this.updatePreview(space, target.sceneMeshes)
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
    this.clearStroke()
    this.onCommit?.(verts, indices, mode, space)
  }

  private updatePreview(space: PolyDrawSpace, sceneMeshes: Mesh[] = []) {
    if (!this.mode) {
      this.root.visible = false
      return
    }

    this.syncSceneVertexMarkers(sceneMeshes, space)
    this.syncPointMeshes()
    this.syncSnapMarker()
    this.syncSnapLine()

    const previewVerts = [...this.vertices]
    if (this.cursorPoint && (this.mode === 'poly' || previewVerts.length < (this.maxVertices() ?? Infinity))) {
      previewVerts.push(this.cursorPoint)
    }

    if (previewVerts.length === 0 && !this.snapHit && !this.hoverHit && sceneMeshes.length === 0) {
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
    const target = this.snapHit ?? this.hoverHit
    if (!target || this.vertices.length === 0) {
      this.snapLineMesh.visible = false
      return
    }

    const last = this.vertices[this.vertices.length - 1]
    const end = target.position
    this.snapLineMesh.geometry.dispose()
    this.snapLineMesh.geometry = new BufferGeometry()
    this.snapLineMesh.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [last.x, last.y, last.z, end.x, end.y, end.z],
        3,
      ),
    )
    ;(this.snapLineMesh.material as LineBasicMaterial).opacity = this.snapHit ? 1 : 0.45
    this.snapLineMesh.visible = true
  }

  private syncPointMeshes() {
    this.clearPointMeshes()

    const activeIndex = this.vertices.length - 1
    this.vertices.forEach((v, i) => {
      const isClose = this.mode === 'poly' && i === 0 && this.closeHover
      const isActive = i === activeIndex
      const mat = isClose ? this.closePointMat : isActive ? this.strokeActiveMat : this.strokePointMat
      const m = new Mesh(this.pointGeo, mat)
      m.position.copy(v)
      m.scale.setScalar(
        isClose ? STROKE_ACTIVE_SCALE + 0.02 : isActive ? STROKE_ACTIVE_SCALE : STROKE_VERTEX_SCALE,
      )
      m.renderOrder = 10
      this.pointMeshes.push(m)
      this.root.add(m)
    })
  }

  private syncSceneVertexMarkers(sceneMeshes: Mesh[], space: PolyDrawSpace) {
    const positions: Vector3[] = []
    const seen = new Set<string>()
    const skipKeys = new Set<string>()

    for (const v of this.vertices) {
      skipKeys.add(this.vertexKey(v))
    }

    for (const mesh of sceneMeshes) {
      if (!(mesh instanceof Mesh) || !mesh.geometry?.attributes?.position) continue
      const pos = mesh.geometry.attributes.position
      mesh.updateMatrixWorld(true)
      for (let i = 0; i < pos.count; i++) {
        worldPoint.fromBufferAttribute(pos, i)
        mesh.localToWorld(worldPoint)
        const display = worldPoint.clone()
        if (space === '2d') display.y = 0
        const key = this.vertexKey(display)
        if (skipKeys.has(key) || seen.has(key)) continue
        seen.add(key)
        positions.push(display)
      }
    }

    if (positions.length === 0) {
      this.clearSceneVertexMarkers()
      return
    }

    this.ensureSceneVertexInstances(positions.length)
    const mesh = this.sceneVertexMesh!
    positions.forEach((position, index) => {
      instanceMatrix.makeScale(SCENE_VERTEX_SCALE, SCENE_VERTEX_SCALE, SCENE_VERTEX_SCALE)
      instanceMatrix.setPosition(position)
      mesh.setMatrixAt(index, instanceMatrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.visible = true
  }

  private ensureSceneVertexInstances(count: number) {
    if (!this.sceneVertexMesh || this.sceneVertexCapacity < count) {
      const capacity = Math.max(count, this.sceneVertexCapacity > 0 ? this.sceneVertexCapacity * 2 : 512)
      if (this.sceneVertexMesh) {
        this.root.remove(this.sceneVertexMesh)
        this.sceneVertexMesh.dispose()
      }
      this.sceneVertexMesh = new InstancedMesh(this.pointGeo, this.sceneVertexMat, capacity)
      this.sceneVertexMesh.renderOrder = 7
      this.root.add(this.sceneVertexMesh)
      this.sceneVertexCapacity = capacity
    }
    this.sceneVertexMesh.count = count
  }

  private clearSceneVertexMarkers() {
    if (this.sceneVertexMesh) {
      this.sceneVertexMesh.visible = false
      this.sceneVertexMesh.count = 0
    }
  }

  private syncSnapMarker() {
    const highlight = this.snapHit ?? this.hoverHit
    if (!highlight) {
      this.clearSnapMarker()
      return
    }

    const pos = highlight.position
    const isClose = highlight.source === 'close'
    const isSnapped = !!this.snapHit

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
    if (!this.hoverRing) {
      this.hoverRing = new Mesh(this.pointGeo, this.hoverRingMat)
      this.hoverRing.renderOrder = 10
      this.root.add(this.hoverRing)
    }

    const coreMat =
      isClose ? this.closePointMat : highlight.source === 'scene' ? this.snapSceneMat : this.snapStrokeMat
    this.snapCore.material = coreMat
    this.snapCore.position.copy(pos)
    this.snapCore.scale.setScalar(isSnapped ? (isClose ? SNAP_CORE_SCALE + 0.02 : SNAP_CORE_SCALE) : 0)
    this.snapCore.visible = isSnapped

    this.snapRing.position.copy(pos)
    this.snapRing.scale.setScalar(isSnapped ? (isClose ? SNAP_RING_SCALE + 0.03 : SNAP_RING_SCALE) : 0)
    this.snapRing.visible = isSnapped

    this.hoverRing.position.copy(pos)
    this.hoverRing.scale.setScalar(isSnapped ? 0 : HOVER_RING_SCALE)
    this.hoverRing.visible = !isSnapped
  }

  private clearPointMeshes() {
    for (const m of this.pointMeshes) {
      this.root.remove(m)
    }
    this.pointMeshes.length = 0
  }

  private clearSnapMarker() {
    if (this.snapCore) {
      this.snapCore.visible = false
    }
    if (this.snapRing) {
      this.snapRing.visible = false
    }
    if (this.hoverRing) {
      this.hoverRing.visible = false
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

  private placementSpace(settings: PolyDrawSettings, resolvedSpace?: PolyDrawSpace): PolyDrawSpace {
    return this.strokeSpace ?? resolvedSpace ?? settings.space
  }

  private resolvePointer(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    settings: PolyDrawSettings,
  ): {
    point: Vector3 | null
    snapHit: SnapHit | null
    hoverHit: SnapHit | null
    closeTarget: boolean
    placementSpace?: PolyDrawSpace
  } {
    this.setRayFromPointer(target, clientX, clientY)

    const activeSpace = this.placementSpace(settings)

    const candidates = this.collectSnapCandidates(target.sceneMeshes)
    const hoverHit = this.findNearestVertex(target, clientX, clientY, candidates, activeSpace, VERTEX_HOVER_PX)
    const snapHit = this.findNearestVertex(target, clientX, clientY, candidates, activeSpace, VERTEX_SNAP_PX)

    if (snapHit) {
      const closeTarget =
        this.mode === 'poly' &&
        this.vertices.length >= 3 &&
        this.sameVertex(snapHit.position, this.vertices[0], activeSpace)
      return { point: snapHit.position.clone(), snapHit, hoverHit, closeTarget }
    }

    const surfaceHit = settings.surface ? this.raycastSurface(target.sceneMeshes) : null
    if (surfaceHit) {
      const point = surfaceHit.clone()
      if (settings.space === '2d' && activeSpace === '2d') point.y = 0
      return {
        point: this.applyGridSnap(point, settings.snap, activeSpace),
        snapHit: null,
        hoverHit,
        closeTarget: false,
        placementSpace: settings.surface ? '3d' : activeSpace,
      }
    }

    if (settings.space === '2d' && activeSpace === '2d') {
      const ground = this.pointerOnGround(settings.snap)
      if (ground) {
        return { point: ground, snapHit: null, hoverHit, closeTarget: false, placementSpace: '2d' }
      }
    }

    const plane = this.pointerOnViewPlane(target, clientX, clientY, settings.snap, activeSpace)
    return {
      point: plane,
      snapHit: null,
      hoverHit,
      closeTarget: false,
      placementSpace: '3d',
    }
  }

  private setRayFromPointer(target: PolyDrawPointerTarget, clientX: number, clientY: number) {
    target.camera.updateMatrixWorld(true)
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

    const addCandidate = (position: Vector3, source: SnapSource, strokeIndex?: number) => {
      const key = `${source}:${strokeIndex ?? ''}:${this.vertexKey(position)}`
      if (seen.has(key)) return
      seen.add(key)
      candidates.push({ position: position.clone(), source, strokeIndex })
    }

    for (let i = 0; i < this.vertices.length; i++) {
      addCandidate(this.vertices[i], 'stroke', i)
    }

    if (this.mode === 'poly' && this.vertices.length >= 3) {
      addCandidate(this.vertices[0], 'close', 0)
    }

    for (const mesh of sceneMeshes) {
      if (!(mesh instanceof Mesh) || !mesh.geometry?.attributes?.position) continue
      const pos = mesh.geometry.attributes.position
      mesh.updateMatrixWorld(true)
      for (let i = 0; i < pos.count; i++) {
        worldPoint.fromBufferAttribute(pos, i)
        mesh.localToWorld(worldPoint)
        addCandidate(worldPoint, 'scene')
      }
    }

    return candidates
  }

  private findNearestVertex(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    candidates: SnapHit[],
    space: PolyDrawSpace,
    radiusPx: number,
  ): SnapHit | null {
    const rect = target.element.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const radiusSq = radiusPx * radiusPx

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
          strokeIndex: candidate.strokeIndex,
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

  private pointerOnViewPlane(
    target: PolyDrawPointerTarget,
    clientX: number,
    clientY: number,
    snap: boolean,
    space: PolyDrawSpace,
  ): Vector3 | null {
    const anchor = this.vertices.length
      ? this.vertices[this.vertices.length - 1]
      : target.orbitTarget
    const p = worldPointOnCameraPlane(target.camera, target.element, clientX, clientY, anchor)
    if (!p) return null
    return this.applyGridSnap(p, snap, space)
  }

  private pointerOnGround(snap: boolean): Vector3 | null {
    const p = raycaster.ray.intersectPlane(GROUND, hit)?.clone()
    if (!p) return null
    p.y = 0
    return this.applyGridSnap(p, snap, '2d')
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
