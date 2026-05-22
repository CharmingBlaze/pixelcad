import {
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  LinearFilter,
  LineSegments,
  Mesh,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import { cadState, getSelected } from './cadState.svelte'
import {
  edgeHelperMat,
  faceOutlineMat,
  faceHelperMat,
  helperOutlineMat,
} from './materials'
import type { SelectionVisualState } from './types'
import { EDIT_HELPER_LIMITS, geometryComplexity, helperStride } from './editPerformance'
import { selectableEdges } from './selectionGeometry'

let helpers: (Mesh | Sprite | LineSegments)[] = []
const yAxis = new Vector3(0, 1, 0)
const vertexTextures = new Map<string, CanvasTexture>()

export function clearSubHelpers() {
  for (const h of helpers) {
    h.parent?.remove(h)
    if ('geometry' in h && h.geometry) h.geometry.dispose()
    if ('material' in h && h.material) {
      const m = h.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  }
  helpers = []
}

export function rebuildSubHelpers() {
  clearSubHelpers()
  const sel = getSelected()
  if (!sel || cadState.editMode === 'object') return

  const mesh = sel.mesh
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const idx = geo.index
  if (!pos) return

  const drawingPoly = cadState.activeTool === 'drawpoly'

  if (drawingPoly || cadState.editMode === 'vertex') {
    rebuildVertexHelpers(mesh, pos, drawingPoly)
    return
  }

  if (cadState.editMode === 'edge' && idx) {
    const edges = selectableEdges(mesh)
    const stride = helperStride(edges.length, EDIT_HELPER_LIMITS.edges)
    for (let i = 0; i < edges.length; i++) {
      const { id: eid, a, b } = edges[i]
      const selected = cadState.selEdges.has(eid)
      const hovered = cadState.hoverEdge === eid
      if (!selected && !hovered && i % stride !== 0) continue
      const state = visualState(selected, hovered)
      const aPt = new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a))
      const bPt = new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
      const outline = edgeBar(
        aPt,
        bPt,
        state === 'selected' ? 0.044 : state === 'hover' ? 0.038 : 0.026,
        helperOutlineMat(),
      )
      outline.userData.edgeId = eid
      outline.renderOrder = 18
      const handle = edgeBar(
        aPt,
        bPt,
        state === 'selected' ? 0.03 : state === 'hover' ? 0.026 : 0.018,
        edgeHelperMat(state),
      )
      handle.userData.edgeId = eid
      handle.renderOrder = 19
      mesh.add(outline, handle)
      helpers.push(outline, handle)

      if (state !== 'normal') {
        for (const point of [aPt, bPt]) {
          const endpoint = vertexSprite(state)
          endpoint.position.copy(point)
          endpoint.scale.multiplyScalar(0.8)
          endpoint.userData.edgeId = eid
          endpoint.renderOrder = 31
          mesh.add(endpoint)
          helpers.push(endpoint)
        }
      }
    }
  } else if (cadState.editMode === 'face' && idx) {
    const arr = idx.array
    const faceStates = new Map<number, SelectionVisualState>()
    const edgeFaces = new Map<string, number[]>()

    for (let i = 0; i < arr.length; i += 3) {
      const fi = Math.floor(i / 3)
      const selected = cadState.selFaces.has(fi)
      const hovered = cadState.hoverFace === fi
      if (!selected && !hovered) continue
      faceStates.set(fi, visualState(selected, hovered))
    }

    for (let i = 0; i < arr.length; i += 3) {
      const fi = Math.floor(i / 3)
      addFaceEdge(edgeFaces, arr[i], arr[i + 1], fi)
      addFaceEdge(edgeFaces, arr[i + 1], arr[i + 2], fi)
      addFaceEdge(edgeFaces, arr[i + 2], arr[i], fi)
    }

    for (let i = 0; i < arr.length; i += 3) {
      const fi = Math.floor(i / 3)
      const state = faceStates.get(fi)
      if (!state) continue
      const a = arr[i]
      const b = arr[i + 1]
      const c = arr[i + 2]
      const fg = new BufferGeometry()
      fg.setAttribute(
        'position',
        new Float32BufferAttribute(
          [
            pos.getX(a), pos.getY(a), pos.getZ(a),
            pos.getX(b), pos.getY(b), pos.getZ(b),
            pos.getX(c), pos.getY(c), pos.getZ(c),
          ],
          3,
        ),
      )
      fg.setIndex([0, 1, 2])
      fg.computeVertexNormals()
      const sm = new Mesh(fg, faceHelperMat(state))
      sm.userData.faceIdx = fi
      sm.renderOrder = 12
      mesh.add(sm)
      helpers.push(sm)

      const pts = [
        new Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)),
        new Vector3(pos.getX(b), pos.getY(b), pos.getZ(b)),
        new Vector3(pos.getX(c), pos.getY(c), pos.getZ(c)),
      ]
      const linePositions: number[] = []
      for (let j = 0; j < 3; j++) {
        const va = [a, b, c][j]
        const vb = [a, b, c][(j + 1) % 3]
        const sharedSameState = (edgeFaces.get(edgeKey(va, vb)) ?? []).some(
          (other) => other !== fi && faceStates.get(other) === state,
        )
        if (sharedSameState) continue
        linePositions.push(
          pts[j].x,
          pts[j].y,
          pts[j].z,
          pts[(j + 1) % 3].x,
          pts[(j + 1) % 3].y,
          pts[(j + 1) % 3].z,
        )
      }
      if (linePositions.length > 0) {
        const lg = new BufferGeometry()
        lg.setAttribute('position', new Float32BufferAttribute(linePositions, 3))
        const lines = new LineSegments(lg, faceOutlineMat(state))
        lines.userData.faceIdx = fi
        lines.renderOrder = 13
        mesh.add(lines)
        helpers.push(lines)
      }
    }
  }
}

function visualState(selected: boolean, hovered: boolean): SelectionVisualState {
  if (selected) return 'selected'
  if (hovered) return 'hover'
  return 'normal'
}

function rebuildVertexHelpers(
  mesh: Mesh,
  pos: NonNullable<Mesh['geometry']['attributes']['position']>,
  showAll: boolean,
) {
  const complexity = geometryComplexity(mesh.geometry)
  const stride = showAll ? 1 : helperStride(complexity.vertices, EDIT_HELPER_LIMITS.vertices)
  const seen = new Set<string>()
  for (let i = 0; i < pos.count; i++) {
    const selected = cadState.selVerts.has(i)
    const hovered = cadState.hoverVert === i
    if (!showAll && !selected && !hovered && i % stride !== 0) continue
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    const state = visualState(selected, hovered)
    const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
    const handle = vertexSprite(state)
    handle.position.copy(p)
    handle.userData.vertIdx = i
    handle.renderOrder = 30
    mesh.add(handle)
    helpers.push(handle)
  }
}

function vertexSprite(state: SelectionVisualState): Sprite {
  const material = new SpriteMaterial({
    map: vertexTexture(state),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const sprite = new Sprite(material)
  const size = state === 'selected' ? 0.16 : state === 'hover' ? 0.15 : 0.12
  sprite.scale.set(size, size, 1)
  return sprite
}

function vertexTexture(state: SelectionVisualState): CanvasTexture {
  const key = state
  const existing = vertexTextures.get(key)
  if (existing) return existing

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, 64, 64)

  const fill = state === 'selected' ? '#f6b63f' : state === 'hover' ? '#f7e96c' : '#33d5de'
  const rim = state === 'normal' ? '#9af4f7' : '#fff6b0'
  const shadow = state === 'normal' ? 'rgba(0, 12, 16, 0.78)' : 'rgba(28, 20, 0, 0.82)'

  ctx.beginPath()
  ctx.arc(32, 32, 20, 0, Math.PI * 2)
  ctx.fillStyle = shadow
  ctx.fill()

  ctx.beginPath()
  ctx.arc(32, 32, 16, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = state === 'normal' ? 3 : 4
  ctx.strokeStyle = '#071015'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(32, 32, state === 'normal' ? 7 : 8, 0, Math.PI * 2)
  ctx.fillStyle = rim
  ctx.fill()

  ctx.beginPath()
  ctx.arc(27, 25, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.fill()

  const texture = new CanvasTexture(canvas)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  vertexTextures.set(key, texture)
  return texture
}

function edgeBar(a: Vector3, b: Vector3, radius: number, material: Mesh['material']): Mesh {
  const dir = b.clone().sub(a)
  const length = Math.max(dir.length(), 0.0001)
  const bar = new Mesh(new CylinderGeometry(radius, radius, length, 6), material)
  bar.position.copy(a).add(b).multiplyScalar(0.5)
  bar.quaternion.copy(new Quaternion().setFromUnitVectors(yAxis, dir.normalize()))
  return bar
}

function addFaceEdge(edges: Map<string, number[]>, a: number, b: number, faceIndex: number) {
  const key = edgeKey(a, b)
  const existing = edges.get(key)
  if (existing) existing.push(faceIndex)
  else edges.set(key, [faceIndex])
}

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

export function getSubHelperObjects(): (Mesh | Sprite | LineSegments)[] {
  return helpers
}
