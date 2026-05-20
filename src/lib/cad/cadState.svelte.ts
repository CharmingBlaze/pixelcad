import { Mesh, Vector3, type Texture } from 'three'
import type { Scene } from 'three'
import { geoForType, createPrimitiveInBox, createPolygonGeometry } from './geometry'
import { getDrawPrimitiveTool } from './drawPrimitiveTool'
import { getPolyDrawTool } from './polyDrawTool'
import { getExtrudeFaceTool } from './extrudeFaceTool'
import { getBevelTool } from './bevelTool'
import { getInsetFaceTool } from './insetFaceTool'
import { getSubdivideTool } from './subdivideTool'
import { refitMeshToBounds, serializeBounds, storeMeshFitBounds } from './boxBounds'
import {
  DEFAULT_MATERIAL_ID,
  defaultMaterialLibrary,
  disposeOwnedMeshMaterial,
  materialFromDefinition,
  matDefault,
  matWire,
  matcapMat,
  sideFromMode,
} from './materials'
import { createCadObject, createSceneNode, syncObjectMetadata } from './modelCore'
import {
  addWireEdges,
  applyBevelEdges,
  averageFaceNormal,
  boundaryEdgesForFaces,
  bevelEdges,
  bevelVerts,
  collectIncidentEdges,
  deleteSelectedElements,
  extrudeFace,
  extrudeFaces,
  fillEdgeLoop,
  fillHoles,
  flipFaces,
  insetFaces,
  mirrorMesh,
  mergePolygonIntoMesh,
  planarProjectUv,
  subdivide,
} from './operations'
import {
  exportCadScene,
  importInterchangeFile,
  pickInterchangeFile,
  restoreUvTextureFromUrl,
  type InterchangeExportFormat,
} from './interchange'
import { deserializeScene, downloadSceneJson, pickSceneFile } from './sceneIO'
import { beginHistoryAction, bindHistoryHooks, clearHistory } from './history.svelte'
import { disposeMeshOutline, setMeshOutlineState } from './outlineSystem'
import { coplanarFaceGroup, selectableEdges } from './selectionGeometry'
import type {
  ActiveTool,
  CadMaterial,
  CadObject,
  EditMode,
  PolyDrawMode,
  PolyDrawSpace,
  PrimitiveType,
  SceneNode,
  FaceSideMode,
  GizmoMode,
  ShadingMode,
  TransformSpace,
} from './types'

let sceneRef: Scene | null = null
let objCounter = 0
let groupCounter = 0

export const cadState = $state({
  objects: [] as CadObject[],
  groups: [] as SceneNode[],
  rootNodeIds: [] as string[],
  materials: defaultMaterialLibrary.map((mat) => ({ ...mat })),
  selectedId: null as string | null,
  selectedGroupId: null as string | null,
  editMode: 'object' as EditMode,
  activeTool: 'select' as ActiveTool,
  drawPrimitiveType: null as PrimitiveType | null,
  drawPolyMode: null as PolyDrawMode | null,
  polyDrawSpace: '2d' as PolyDrawSpace,
  polyDrawSurface: false,
  polyDrawContinuous: false,
  polyDrawTargetId: null as string | null,
  shadingMode: 'solid' as ShadingMode,
  faceSide: 'double' as FaceSideMode,
  solidSeeThrough: false,
  wireframeGlobal: false,
  outlinesEnabled: true,
  activeViewport: 1,
  gizmoMode: 'translate' as GizmoMode,
  transformSpace: 'world' as TransformSpace,
  transformSnap: true,
  selVerts: new Set<number>(),
  selEdges: new Set<string>(),
  selFaces: new Set<number>(),
  hoverVert: null as number | null,
  hoverEdge: null as string | null,
  hoverFace: null as number | null,
  /** Bumped when geometry or helpers need refresh */
  revision: 0,
})

export function bindScene(scene: Scene) {
  sceneRef = scene
}

export function getScene(): Scene | null {
  return sceneRef
}

export function getSelected(): CadObject | null {
  return cadState.objects.find((o) => o.id === cadState.selectedId) ?? null
}

export function getGroup(id: string | null): SceneNode | null {
  return id ? cadState.groups.find((g) => g.id === id) ?? null : null
}

function bump() {
  cadState.revision++
}

function applyShadingToMesh(mesh: Mesh, selected: boolean) {
  const materialId = (mesh.userData.materialId as string | undefined) ?? DEFAULT_MATERIAL_ID
  const definition =
    cadState.materials.find((mat) => mat.id === materialId) ?? cadState.materials[0]

  switch (cadState.shadingMode) {
    case 'solid':
      disposeOwnedMeshMaterial(mesh)
      mesh.material = materialFromDefinition(
        definition,
        selected,
        cadState.faceSide,
        cadState.solidSeeThrough,
        mesh.userData.uvTexture as Texture | undefined,
      )
      break
    case 'wire':
      disposeOwnedMeshMaterial(mesh)
      matWire.side = sideFromMode(cadState.faceSide)
      mesh.material = matWire
      break
    case 'matcap':
      disposeOwnedMeshMaterial(mesh)
      matcapMat.side = sideFromMode(cadState.faceSide)
      mesh.material = matcapMat
      break
  }
  setMeshOutlineState(mesh, {
    visible: cadState.outlinesEnabled && cadState.shadingMode === 'solid',
    selected,
    selectionHighlight:
      selected && cadState.editMode === 'object' && cadState.shadingMode === 'solid',
  })
}

export function refreshMaterials() {
  for (const obj of cadState.objects) {
    syncObjectMetadata(obj)
    applyShadingToMesh(obj.mesh, obj.id === cadState.selectedId)
  }
}

export function refreshObject(obj: CadObject) {
  syncObjectMetadata(obj)
  addWireEdges(obj.mesh)
  applyShadingToMesh(obj.mesh, obj.id === cadState.selectedId)
  bump()
}

bindHistoryHooks({
  getScene: () => sceneRef,
  getObjects: () => cadState.objects,
  getGroups: () => cadState.groups,
  getRootNodeIds: () => cadState.rootNodeIds,
  getMaterials: () => cadState.materials,
  getSelectedName: () => getSelected()?.name ?? null,
  setSceneState: (objects, groups, rootNodeIds, counter, selectedName, materials) => {
    objCounter = counter
    cadState.objects = objects
    cadState.groups = groups
    cadState.rootNodeIds = rootNodeIds
    cadState.materials = materials.map((mat) => ({ ...mat }))
    const match = selectedName ? objects.find((o) => o.name === selectedName) : null
    cadState.selectedId = match?.id ?? null
    cadState.selectedGroupId = null
    refreshMaterials()
    syncSceneObjectOrder()
  },
  disposeAll: () => {
    if (!sceneRef) return
    for (const obj of cadState.objects) disposeObject(obj)
    cadState.objects = []
    cadState.groups = []
    cadState.rootNodeIds = []
  },
  bump,
})

export function updateSelectedTransform(t: {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}) {
  const sel = getSelected()
  if (!sel) return
  if (t.position) sel.mesh.position.fromArray(t.position)
  if (t.rotation) sel.mesh.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2])
  if (t.scale) sel.mesh.scale.fromArray(t.scale)
  bump()
}

export function selectObject(id: string | null) {
  const target = id ? cadState.objects.find((o) => o.id === id) : null
  if (target?.node.locked) return
  cadState.selectedId = id
  cadState.selectedGroupId = null
  cadState.selVerts = new Set()
  cadState.selEdges = new Set()
  cadState.selFaces = new Set()
  refreshMaterials()
  bump()
}

export function selectGroup(id: string | null) {
  const target = getGroup(id)
  if (target?.locked) return
  cadState.selectedId = null
  cadState.selectedGroupId = id
  cadState.selVerts = new Set()
  cadState.selEdges = new Set()
  cadState.selFaces = new Set()
  refreshMaterials()
  bump()
}

export function setObjectVisible(id: string, visible: boolean) {
  const obj = cadState.objects.find((o) => o.id === id)
  if (!obj) return
  obj.node.visible = visible
  obj.mesh.visible = visible
  bump()
}

export function setObjectLocked(id: string, locked: boolean) {
  const obj = cadState.objects.find((o) => o.id === id)
  if (!obj) return
  obj.node.locked = locked
  if (locked && cadState.selectedId === id) selectObject(null)
  bump()
}

export function setGroupVisible(id: string, visible: boolean) {
  const group = getGroup(id)
  if (!group) return
  group.visible = visible
  for (const childId of group.children) setObjectVisible(childId, visible)
  bump()
}

export function setGroupLocked(id: string, locked: boolean) {
  const group = getGroup(id)
  if (!group) return
  group.locked = locked
  for (const childId of group.children) {
    const obj = cadState.objects.find((o) => o.id === childId)
    if (obj) obj.node.locked = locked
  }
  if (locked && cadState.selectedGroupId === id) selectGroup(null)
  if (locked && group.children.includes(cadState.selectedId ?? '')) selectObject(null)
  bump()
}

export function addGroup(name?: string) {
  beginHistoryAction()
  groupCounter++
  const id = crypto.randomUUID()
  const group = createSceneNode(id, name ?? `Group.${String(groupCounter).padStart(3, '0')}`)
  group.kind = 'group'
  cadState.groups = [...cadState.groups, group]
  cadState.rootNodeIds = [...cadState.rootNodeIds, id]
  selectGroup(id)
}

export function addObject(type: PrimitiveType, recordHistory = true) {
  if (!sceneRef) return
  if (recordHistory) beginHistoryAction()
  const geo = geoForType(type)
  const mesh = new Mesh(geo, matDefault())
  mesh.position.set((Math.random() - 0.5) * 3, 0.7, (Math.random() - 0.5) * 3)
  mesh.castShadow = true
  objCounter++
  const name = `${type[0].toUpperCase()}${type.slice(1)}.${String(objCounter).padStart(3, '0')}`
  mesh.userData = { type, name, outline: null, wireEdges: null, materialId: DEFAULT_MATERIAL_ID }
  addWireEdges(mesh)
  sceneRef.add(mesh)

  const id = crypto.randomUUID()
  cadState.objects = [...cadState.objects, createCadObject({ id, mesh, type, name })]
  cadState.rootNodeIds = [...cadState.rootNodeIds, id]
  selectObject(id)
}

export function addObjectInBox(
  type: PrimitiveType,
  min: Vector3,
  max: Vector3,
  recordHistory = true,
) {
  if (!sceneRef) return
  if (recordHistory) beginHistoryAction()
  const geo = createPrimitiveInBox(type, min, max)
  const mesh = new Mesh(geo, matDefault())
  mesh.castShadow = true
  objCounter++
  const name = `${type[0].toUpperCase()}${type.slice(1)}.${String(objCounter).padStart(3, '0')}`
  mesh.userData = { type, name, outline: null, wireEdges: null, materialId: DEFAULT_MATERIAL_ID }
  addWireEdges(mesh)
  sceneRef.add(mesh)

  const id = crypto.randomUUID()
  cadState.objects = [...cadState.objects, createCadObject({ id, mesh, type, name })]
  cadState.rootNodeIds = [...cadState.rootNodeIds, id]
  selectObject(id)
  cadState.drawPrimitiveType = null
  cadState.activeTool = 'select'
  bump()
}

export function addPolygonObject(
  vertices: Vector3[],
  indices: number[],
  label: 'Triangle' | 'Quad' | 'Polygon',
  space: PolyDrawSpace = '2d',
  recordHistory = true,
): string | null {
  if (!sceneRef || vertices.length < 3) return null
  if (recordHistory) beginHistoryAction()
  const geo = createPolygonGeometry(vertices, indices, space)
  const mesh = new Mesh(geo, matDefault())
  mesh.castShadow = true
  objCounter++
  const name = `${label}.${String(objCounter).padStart(3, '0')}`
  mesh.userData = {
    type: 'polygon',
    name,
    outline: null,
    wireEdges: null,
    materialId: DEFAULT_MATERIAL_ID,
  }
  addWireEdges(mesh)
  sceneRef.add(mesh)

  const id = crypto.randomUUID()
  cadState.objects = [
    ...cadState.objects,
    createCadObject({ id, mesh, type: 'polygon', name }),
  ]
  cadState.rootNodeIds = [...cadState.rootNodeIds, id]
  selectObject(id)
  bump()
  return id
}

function finishPolyDrawCommit(mode: PolyDrawMode, continuous: boolean) {
  if (continuous) {
    const sel = getSelected()
    if (sel) cadState.polyDrawTargetId = sel.id
    cadState.drawPolyMode = mode
    cadState.activeTool = 'drawpoly'
    getPolyDrawTool()?.start(mode)
  } else {
    getPolyDrawTool()?.cancel()
    cadState.drawPolyMode = null
    cadState.polyDrawTargetId = null
    if (cadState.activeTool === 'drawpoly') cadState.activeTool = 'select'
  }
  bump()
}

export function commitPolyDraw(
  vertices: Vector3[],
  indices: number[],
  mode: PolyDrawMode,
  space: PolyDrawSpace,
) {
  if (!sceneRef || vertices.length < 3) return

  const targetId = cadState.polyDrawTargetId
  const sel = targetId ? cadState.objects.find((o) => o.id === targetId) ?? null : null
  const continuous = cadState.polyDrawContinuous

  if (sel) {
    beginHistoryAction()
    if (!mergePolygonIntoMesh(sel.mesh, vertices, indices)) return
    refreshObject(sel)
    finishPolyDrawCommit(mode, continuous)
    return
  }

  const label = mode === 'triangle' ? 'Triangle' : mode === 'quad' ? 'Quad' : 'Polygon'
  addPolygonObject(vertices, indices, label, space)
  finishPolyDrawCommit(mode, continuous)
}

export function setPolyDrawSpace(space: PolyDrawSpace) {
  cadState.polyDrawSpace = space
  bump()
}

export function setPolyDrawSurface(enabled: boolean) {
  cadState.polyDrawSurface = enabled
  bump()
}

export function setPolyDrawContinuous(enabled: boolean) {
  cadState.polyDrawContinuous = enabled
  bump()
}

export function startDrawPoly(mode: PolyDrawMode) {
  cancelDrawPrimitive()
  cancelDrawPoly()
  cancelExtrude()
  cancelInset()
  cancelSubdivide()
  cancelBevel()

  if (!getSelected()) {
    cadState.editMode = 'object'
    selectObject(null)
    cadState.polyDrawTargetId = null
  } else {
    cadState.polyDrawTargetId = cadState.selectedId
  }

  cadState.drawPolyMode = mode
  cadState.activeTool = 'drawpoly'
  getPolyDrawTool()?.start(mode)
  bump()
}

export function cancelDrawPoly() {
  if (!cadState.drawPolyMode && cadState.activeTool !== 'drawpoly') return
  getPolyDrawTool()?.cancel()
  cadState.drawPolyMode = null
  cadState.polyDrawTargetId = null
  if (cadState.activeTool === 'drawpoly') cadState.activeTool = 'select'
  bump()
}

export function startDrawPrimitive(type: PrimitiveType) {
  cancelDrawPoly()
  cancelExtrude()
  cancelBevel()
  cadState.editMode = 'object'
  cadState.drawPrimitiveType = type
  cadState.activeTool = 'drawbox'
  selectObject(null)
  getDrawPrimitiveTool()?.start(type)
  bump()
}

export function cancelDrawPrimitive() {
  if (!cadState.drawPrimitiveType && cadState.activeTool !== 'drawbox') return
  getDrawPrimitiveTool()?.cancel()
  cadState.drawPrimitiveType = null
  cadState.activeTool = 'select'
  bump()
}

export function drawPrimitiveStatus(): string {
  return (
    getExtrudeFaceTool()?.statusText() ||
    getInsetFaceTool()?.statusText() ||
    getSubdivideTool()?.statusText() ||
    getBevelTool()?.statusText() ||
    getPolyDrawTool()?.statusText({
      space: cadState.polyDrawSpace,
      surface: cadState.polyDrawSurface,
      mergeTarget:
        cadState.polyDrawTargetId
          ? cadState.objects.find((o) => o.id === cadState.polyDrawTargetId)?.name
          : undefined,
    }) ||
    getDrawPrimitiveTool()?.statusText() ||
    ''
  )
}

function collectBevelEdgeSelection(mesh: Mesh): Set<string> {
  if (cadState.editMode === 'edge') return new Set(cadState.selEdges)
  if (cadState.editMode === 'vertex') return collectIncidentEdges(mesh, cadState.selVerts)
  if (cadState.editMode === 'face') return boundaryEdgesForFaces(mesh, cadState.selFaces)
  return new Set()
}

export function startInteractiveBevel() {
  const sel = getSelected()
  if (!sel || cadState.editMode === 'object') return
  const edges = collectBevelEdgeSelection(sel.mesh)
  if (edges.size === 0) return

  cancelDrawPrimitive()
  cancelDrawPoly()
  cancelExtrude()
  cancelInset()
  cancelSubdivide()
  cancelBevel()
  cadState.activeTool = 'bevel'
  getBevelTool()?.start(sel.mesh, edges)
  bump()
}

export function commitBevel(width: number, edgeIds: Set<string>) {
  const sel = getSelected()
  if (!sel || edgeIds.size === 0) return
  beginHistoryAction()
  if (!applyBevelEdges(sel.mesh, edgeIds, width)) return
  cadState.selEdges = new Set()
  cadState.selVerts = new Set()
  cadState.activeTool = 'select'
  refreshObject(sel)
}

export function cancelBevel() {
  if (cadState.activeTool !== 'bevel' && !getBevelTool()?.active) return
  getBevelTool()?.cancel()
  if (cadState.activeTool === 'bevel') cadState.activeTool = 'select'
  bump()
}

export function deleteSelected() {
  const sel = getSelected()
  if (!sel || !sceneRef) return

  if (cadState.editMode !== 'object') {
    const hasSubSelection =
      cadState.selVerts.size > 0 || cadState.selEdges.size > 0 || cadState.selFaces.size > 0
    if (!hasSubSelection) return
    beginHistoryAction()
    const changed = deleteSelectedElements(
      sel.mesh,
      cadState.editMode,
      cadState.selVerts,
      cadState.selEdges,
      cadState.selFaces,
    )
    if (!changed) return
    cadState.selVerts = new Set()
    cadState.selEdges = new Set()
    cadState.selFaces = new Set()
    refreshObject(sel)
    return
  }

  beginHistoryAction()
  disposeMeshOutline(sel.mesh)
  sceneRef.remove(sel.mesh)
  cadState.objects = cadState.objects.filter((o) => o.id !== sel.id)
  cadState.rootNodeIds = cadState.rootNodeIds.filter((id) => id !== sel.id)
  cadState.groups.forEach((group) => {
    group.children = group.children.filter((id) => id !== sel.id)
  })
  selectObject(null)
}

export function duplicateSelected() {
  const sel = getSelected()
  if (!sel || !sceneRef) return
  beginHistoryAction()
  const mesh = new Mesh(sel.mesh.geometry.clone(), matDefault())
  mesh.position.copy(sel.mesh.position).add(new Vector3(0.5, 0, 0.5))
  mesh.rotation.copy(sel.mesh.rotation)
  mesh.scale.copy(sel.mesh.scale)
  objCounter++
  const name = `${sel.type[0].toUpperCase()}${sel.type.slice(1)}.${String(objCounter).padStart(3, '0')}`
  mesh.userData = {
    type: sel.type,
    name,
    outline: null,
    wireEdges: null,
    materialId: sel.materialId,
  }
  addWireEdges(mesh)
  sceneRef.add(mesh)
  const id = crypto.randomUUID()
  cadState.objects = [
    ...cadState.objects,
    createCadObject({ id, mesh, type: sel.type, name, materialId: sel.materialId }),
  ]
  cadState.rootNodeIds = [...cadState.rootNodeIds, id]
  selectObject(id)
}

function disposeObject(obj: CadObject) {
  if (!sceneRef) return
  disposeMeshOutline(obj.mesh)
  sceneRef.remove(obj.mesh)
  obj.mesh.geometry.dispose()
  disposeOwnedMeshMaterial(obj.mesh)
}

export function clearScene() {
  if (!sceneRef) return
  beginHistoryAction()
    cancelDrawPrimitive()
    cancelDrawPoly()
    cancelExtrude()
    cancelInset()
    cancelSubdivide()
    cancelBevel()
  for (const obj of cadState.objects) disposeObject(obj)
  cadState.objects = []
  cadState.groups = []
  cadState.rootNodeIds = []
  objCounter = 0
  groupCounter = 0
  clearHistory()
  selectObject(null)
}

export function setEditMode(mode: EditMode) {
  if (mode !== 'object') {
    cancelDrawPrimitive()
    cancelExtrude()
    cancelInset()
    cancelSubdivide()
    cancelBevel()
  }
  cadState.editMode = mode
  cadState.selVerts = new Set()
  cadState.selEdges = new Set()
  cadState.selFaces = new Set()
  clearSubHover()
  refreshMaterials()
  bump()
}

export function setTool(tool: ActiveTool) {
  if (tool !== 'drawbox') cancelDrawPrimitive()
  if (tool !== 'drawpoly') cancelDrawPoly()
  if (tool !== 'extrudeface') cancelExtrude()
  if (tool !== 'insetface') cancelInset()
  if (tool !== 'subdividetool') cancelSubdivide()
  if (tool !== 'bevel') cancelBevel()
  cadState.activeTool = tool
}

export function setGizmoMode(mode: GizmoMode) {
  cadState.gizmoMode = mode
}

export function setTransformSpace(space: TransformSpace) {
  cadState.transformSpace = space
  bump()
}

export function setTransformSnap(enabled: boolean) {
  cadState.transformSnap = enabled
  bump()
}

export function setShading(mode: ShadingMode) {
  cadState.shadingMode = mode
  refreshMaterials()
  bump()
}

export function setFaceSide(mode: FaceSideMode) {
  cadState.faceSide = mode
  refreshMaterials()
  bump()
}

export function setSolidSeeThrough(enabled: boolean) {
  cadState.solidSeeThrough = enabled
  refreshMaterials()
  bump()
}

export function toggleWireframeGlobal() {
  cadState.wireframeGlobal = !cadState.wireframeGlobal
  cadState.outlinesEnabled = !cadState.outlinesEnabled
  refreshMaterials()
  bump()
}

export function subdivideSelected() {
  const sel = getSelected()
  if (!sel || !sel.mesh.geometry.index || !sel.mesh.geometry.attributes.position) return

  cancelDrawPrimitive()
  cancelDrawPoly()
  cancelExtrude()
  cancelInset()
  cancelSubdivide()
  cancelBevel()

  const faces =
    cadState.editMode === 'face' && cadState.selFaces.size > 0
      ? new Set(cadState.selFaces)
      : null
  cadState.activeTool = 'subdividetool'
  getSubdivideTool()?.start(sel.mesh, faces)
  bump()
}

export function commitSubdivide(cuts: number, smooth: number, faceIndices: Set<number> | null) {
  const sel = getSelected()
  if (!sel) return
  beginHistoryAction()
  subdivide(sel.mesh, faceIndices, cuts, smooth)
  if (faceIndices) cadState.selFaces = new Set()
  cadState.activeTool = 'select'
  refreshObject(sel)
}

export function cancelSubdivide() {
  if (cadState.activeTool !== 'subdividetool' && !getSubdivideTool()?.active) return
  getSubdivideTool()?.cancel()
  if (cadState.activeTool === 'subdividetool') cadState.activeTool = 'select'
  bump()
}

export function extrudeSelectedFace() {
  const sel = getSelected()
  if (!sel || cadState.editMode !== 'face' || cadState.selFaces.size === 0) return
  const idx = sel.mesh.geometry.index
  const pos = sel.mesh.geometry.attributes.position
  if (!idx || !pos) return

  cancelDrawPrimitive()
  cancelDrawPoly()
  cancelInset()
  cancelSubdivide()
  cancelBevel()
  const arr = Array.from(idx.array)
  const normal = averageFaceNormal(pos, arr, cadState.selFaces)
  cadState.activeTool = 'extrudeface'
  getExtrudeFaceTool()?.start(sel.mesh, cadState.selFaces, normal)
  bump()
}

export function commitExtrudeFaces(distance: number) {
  const sel = getSelected()
  if (!sel || cadState.selFaces.size === 0) return
  beginHistoryAction()
  const faces = new Set(cadState.selFaces)
  const newFaces = extrudeFaces(sel.mesh, faces, distance)
  cadState.selFaces = newFaces
  cadState.activeTool = 'select'
  cadState.gizmoMode = 'translate'
  refreshObject(sel)
}

export function cancelExtrude() {
  if (cadState.activeTool !== 'extrudeface' && !getExtrudeFaceTool()?.active) return
  getExtrudeFaceTool()?.cancel()
  if (cadState.activeTool === 'extrudeface') cadState.activeTool = 'select'
  bump()
}

export function fillSelectedEdges() {
  const sel = getSelected()
  if (!sel || cadState.editMode !== 'edge' || cadState.selEdges.size < 3) return
  beginHistoryAction()
  if (!fillEdgeLoop(sel.mesh, cadState.selEdges)) return
  cadState.selEdges = new Set()
  refreshObject(sel)
}

export function fillAllHoles() {
  const sel = getSelected()
  if (!sel) return
  beginHistoryAction()
  if (fillHoles(sel.mesh) === 0) return
  refreshObject(sel)
}

export function mirrorSelected(axis: 'x' | 'y' | 'z') {
  const sel = getSelected()
  if (!sel) return
  beginHistoryAction()
  if (!mirrorMesh(sel.mesh, axis)) return
  refreshObject(sel)
}

export function bevelSelectedVerts() {
  startInteractiveBevel()
}

export function insetSelectedFaces() {
  const sel = getSelected()
  if (
    !sel ||
    cadState.editMode !== 'face' ||
    cadState.selFaces.size === 0 ||
    !sel.mesh.geometry.index ||
    !sel.mesh.geometry.attributes.position
  ) return

  cancelDrawPrimitive()
  cancelDrawPoly()
  cancelExtrude()
  cancelInset()
  cancelSubdivide()
  cancelBevel()

  cadState.activeTool = 'insetface'
  getInsetFaceTool()?.start(sel.mesh, cadState.selFaces)
  bump()
}

export function commitInsetFaces(amount: number, faceIndices: Set<number>) {
  const sel = getSelected()
  if (!sel || faceIndices.size === 0) return
  beginHistoryAction()
  if (!insetFaces(sel.mesh, faceIndices, amount)) return
  cadState.selFaces = new Set()
  cadState.activeTool = 'select'
  refreshObject(sel)
}

export function cancelInset() {
  if (cadState.activeTool !== 'insetface' && !getInsetFaceTool()?.active) return
  getInsetFaceTool()?.cancel()
  if (cadState.activeTool === 'insetface') cadState.activeTool = 'select'
  bump()
}

export function flipSelectedFaces() {
  const sel = getSelected()
  if (!sel || cadState.editMode !== 'face' || cadState.selFaces.size === 0 || !sel.mesh.geometry.index) return
  beginHistoryAction()
  if (!flipFaces(sel.mesh, cadState.selFaces)) return
  refreshObject(sel)
}

export function projectSelectedUv(axis: 'x' | 'y' | 'z' = 'y') {
  const sel = getSelected()
  if (!sel || !sel.mesh.geometry.attributes.position) return
  beginHistoryAction()
  if (!planarProjectUv(sel.mesh, axis)) return
  sel.uvChannels = sel.uvChannels.map((uv) =>
    uv.active ? { ...uv, name: `Planar ${axis.toUpperCase()}` } : uv,
  )
  refreshObject(sel)
}

export function growSubSelection() {
  const sel = getSelected()
  if (!sel || cadState.editMode === 'object') return
  const idx = sel.mesh.geometry.index
  if (!idx) return
  const arr = idx.array

  if (cadState.editMode === 'vertex') {
    const grown = new Set(cadState.selVerts)
    for (let i = 0; i < arr.length; i += 3) {
      const tri = [arr[i], arr[i + 1], arr[i + 2]]
      if (tri.some((v) => cadState.selVerts.has(v))) tri.forEach((v) => grown.add(v))
    }
    cadState.selVerts = grown
  } else if (cadState.editMode === 'edge') {
    const selectedVerts = new Set<number>()
    cadState.selEdges.forEach((eid) => {
      const [a, b] = eid.split('_').map((n) => parseInt(n, 10))
      if (Number.isFinite(a)) selectedVerts.add(a)
      if (Number.isFinite(b)) selectedVerts.add(b)
    })
    const grown = new Set(cadState.selEdges)
    for (let i = 0; i < arr.length; i += 3) {
      const pairs = [
        [arr[i], arr[i + 1]],
        [arr[i + 1], arr[i + 2]],
        [arr[i + 2], arr[i]],
      ]
      for (const [a, b] of pairs) {
        if (selectedVerts.has(a) || selectedVerts.has(b)) {
          grown.add(`${Math.min(a, b)}_${Math.max(a, b)}`)
        }
      }
    }
    cadState.selEdges = grown
  } else if (cadState.editMode === 'face') {
    const selectedVerts = new Set<number>()
    cadState.selFaces.forEach((fi) => {
      selectedVerts.add(arr[fi * 3])
      selectedVerts.add(arr[fi * 3 + 1])
      selectedVerts.add(arr[fi * 3 + 2])
    })
    const grown = new Set(cadState.selFaces)
    for (let i = 0; i < arr.length; i += 3) {
      if ([arr[i], arr[i + 1], arr[i + 2]].some((v) => selectedVerts.has(v))) grown.add(i / 3)
    }
    cadState.selFaces = grown
  }
  bump()
}

export function selectAllSub() {
  const sel = getSelected()
  if (!sel) return
  const pos = sel.mesh.geometry.attributes.position
  const idx = sel.mesh.geometry.index
  if (cadState.editMode === 'vertex' && pos) {
    const s = new Set<number>()
    for (let i = 0; i < pos.count; i++) s.add(i)
    cadState.selVerts = s
  } else if (cadState.editMode === 'face' && idx) {
    const s = new Set<number>()
    for (let i = 0; i < idx.count / 3; i++) s.add(i)
    cadState.selFaces = s
  } else if (cadState.editMode === 'edge' && idx) {
    const s = new Set<string>()
    selectableEdges(sel.mesh).forEach((edge) => s.add(edge.id))
    cadState.selEdges = s
  }
  bump()
}

export function deselectAllSub() {
  cadState.selVerts = new Set()
  cadState.selEdges = new Set()
  cadState.selFaces = new Set()
  bump()
}

export function setSubHover(target: { vert?: number | null; edge?: string | null; face?: number | null }) {
  const nextVert = target.vert ?? null
  const nextEdge = target.edge ?? null
  const nextFace = target.face ?? null
  if (
    cadState.hoverVert === nextVert &&
    cadState.hoverEdge === nextEdge &&
    cadState.hoverFace === nextFace
  ) {
    return
  }
  cadState.hoverVert = nextVert
  cadState.hoverEdge = nextEdge
  cadState.hoverFace = nextFace
  bump()
}

export function clearSubHover() {
  setSubHover({})
}

export function invertFaceSelection() {
  const sel = getSelected()
  if (!sel || cadState.editMode !== 'face') return
  const idx = sel.mesh.geometry.index
  if (!idx) return
  const t = new Set<number>()
  for (let i = 0; i < idx.count / 3; i++) {
    if (!cadState.selFaces.has(i)) t.add(i)
  }
  cadState.selFaces = t
  bump()
}

export function toggleVert(vi: number) {
  const s = new Set(cadState.selVerts)
  if (s.has(vi)) s.delete(vi)
  else s.add(vi)
  cadState.selVerts = s
  bump()
}

export function pickVert(vi: number, additive = false) {
  if (!additive) {
    cadState.selVerts = new Set([vi])
  } else {
    toggleVert(vi)
    return
  }
  bump()
}

export function toggleEdge(eid: string) {
  const s = new Set(cadState.selEdges)
  if (s.has(eid)) s.delete(eid)
  else s.add(eid)
  cadState.selEdges = s
  bump()
}

export function pickEdge(eid: string, additive = false) {
  if (!additive) {
    cadState.selEdges = new Set([eid])
  } else {
    toggleEdge(eid)
    return
  }
  bump()
}

export function toggleFace(fi: number) {
  const s = new Set(cadState.selFaces)
  const group = getSelected() ? coplanarFaceGroup(getSelected()!.mesh, fi) : new Set([fi])
  const selected = [...group].every((face) => s.has(face))
  group.forEach((face) => {
    if (selected) s.delete(face)
    else s.add(face)
  })
  cadState.selFaces = s
  bump()
}

export function pickFace(fi: number, additive = false) {
  const group = getSelected() ? coplanarFaceGroup(getSelected()!.mesh, fi) : new Set([fi])
  if (!additive) {
    cadState.selFaces = group
  } else {
    toggleFace(fi)
    return
  }
  bump()
}

export function assignSelectedMaterial(materialId: string) {
  const sel = getSelected()
  if (!sel || !cadState.materials.some((mat) => mat.id === materialId)) return
  beginHistoryAction()
  sel.materialId = materialId
  sel.mesh.userData.materialId = materialId
  refreshObject(sel)
}

export function patchMaterial(id: string, patch: Partial<Omit<CadMaterial, 'id'>>) {
  const index = cadState.materials.findIndex((entry) => entry.id === id)
  if (index === -1) return
  cadState.materials = cadState.materials.map((entry, i) =>
    i === index ? { ...entry, ...patch } : entry,
  )
  refreshMaterials()
  bump()
}

export function createMaterial(source?: Partial<CadMaterial>): string {
  beginHistoryAction()
  const id = `mat-${Date.now()}`
  cadState.materials = [
    ...cadState.materials,
    {
      id,
      name: source?.name ?? 'New Material',
      color: source?.color ?? '#7a8ea8',
      roughness: source?.roughness ?? 0.45,
      metalness: source?.metalness ?? 0,
      flatShading: source?.flatShading ?? true,
    },
  ]
  bump()
  return id
}

export function duplicateMaterial(id: string): string | null {
  const source = cadState.materials.find((entry) => entry.id === id)
  if (!source) return null
  beginHistoryAction()
  const newId = `mat-${Date.now()}`
  cadState.materials = [
    ...cadState.materials,
    {
      ...source,
      id: newId,
      name: `${source.name} Copy`,
    },
  ]
  bump()
  return newId
}

export function deleteMaterial(id: string): boolean {
  if (id === DEFAULT_MATERIAL_ID || cadState.materials.length <= 1) return false
  beginHistoryAction()
  cadState.materials = cadState.materials.filter((entry) => entry.id !== id)
  for (const obj of cadState.objects) {
    if (obj.materialId !== id) continue
    obj.materialId = DEFAULT_MATERIAL_ID
    obj.mesh.userData.materialId = DEFAULT_MATERIAL_ID
  }
  refreshMaterials()
  bump()
  return true
}

export function renameSelected(name: string) {
  const sel = getSelected()
  if (!sel) return
  renameObject(sel.id, name)
}

export function renameObject(id: string, name: string) {
  const obj = cadState.objects.find((o) => o.id === id)
  const trimmed = name.trim()
  if (!obj || !trimmed || trimmed === obj.name) return
  beginHistoryAction()
  obj.name = trimmed
  obj.node.name = trimmed
  obj.mesh.userData.name = trimmed
  bump()
}

export function renameGroup(id: string, name: string) {
  const group = getGroup(id)
  const trimmed = name.trim()
  if (!group || !trimmed || trimmed === group.name) return
  beginHistoryAction()
  group.name = trimmed
  bump()
}

export function renameNode(id: string, name: string) {
  if (cadState.objects.some((o) => o.id === id)) renameObject(id, name)
  else renameGroup(id, name)
}

export function reorderObject(id: string, targetId: string, position: 'above' | 'below') {
  reorderNode(id, targetId, position)
}

export function reorderNode(
  id: string,
  targetId: string,
  position: 'above' | 'below' | 'inside',
) {
  if (id === targetId) return
  const movingGroup = getGroup(id)
  if (movingGroup && position === 'inside') return
  if (!cadState.rootNodeIds.includes(id) && !cadState.groups.some((g) => g.children.includes(id))) return

  const rootNodeIds = [...cadState.rootNodeIds]
  const groups = cadState.groups.map((group) => ({ ...group, children: [...group.children] }))
  const source = collectionForNode(id, rootNodeIds, groups)
  if (!source) return
  const currentIndex = source.ids.indexOf(id)
  if (currentIndex >= 0) source.ids.splice(currentIndex, 1)

  let destinationIds: string[] | null = null
  let insertAt = 0
  let nextParentId: string | null | undefined

  if (position === 'inside') {
    const targetGroup = groups.find((group) => group.id === targetId)
    if (!targetGroup) return
    destinationIds = targetGroup.children
    insertAt = targetGroup.children.length
    nextParentId = targetGroup.id
  } else {
    const destination = collectionForNode(targetId, rootNodeIds, groups)
    if (!destination) return
    if (movingGroup && destination.parentId) return
    destinationIds = destination.ids
    const targetIndex = destinationIds.indexOf(targetId)
    if (targetIndex < 0) return
    insertAt = position === 'above' ? targetIndex : targetIndex + 1
    nextParentId = destination.parentId
  }

  beginHistoryAction()
  const obj = cadState.objects.find((o) => o.id === id)
  if (obj) obj.node.parentId = nextParentId ?? null
  destinationIds.splice(insertAt, 0, id)
  cadState.rootNodeIds = rootNodeIds
  cadState.groups = groups
  sortObjectsForOutliner()
  syncSceneObjectOrder()
  bump()
}

function collectionForNode(
  id: string,
  rootNodeIds = cadState.rootNodeIds,
  groups = cadState.groups,
): { ids: string[]; parentId: string | null } | null {
  if (rootNodeIds.includes(id)) return { ids: rootNodeIds, parentId: null }
  for (const group of groups) {
    if (group.children.includes(id)) return { ids: group.children, parentId: group.id }
  }
  return null
}

function sortObjectsForOutliner() {
  const order = new Map<string, number>()
  let i = 0
  for (const rootId of cadState.rootNodeIds) {
    order.set(rootId, i++)
    const group = getGroup(rootId)
    if (group) {
      for (const childId of group.children) order.set(childId, i++)
    }
  }
  cadState.objects = [...cadState.objects].sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
}

function syncSceneObjectOrder() {
  if (!sceneRef) return
  for (const obj of cadState.objects) {
    if (obj.mesh.parent === sceneRef) sceneRef.remove(obj.mesh)
  }
  for (const obj of cadState.objects) {
    sceneRef.add(obj.mesh)
  }
}

export function exportScene(format: InterchangeExportFormat) {
  exportCadScene(format, cadState.objects, cadState.materials)
}

export function exportObj() {
  exportScene('obj')
}

export function saveSceneToFile() {
  downloadSceneJson(cadState.objects, cadState.groups, cadState.rootNodeIds, cadState.materials)
}

export async function importMeshFromFile() {
  if (!sceneRef) return
  const file = await pickInterchangeFile()
  if (!file) return

  try {
    beginHistoryAction()
    const result = await importInterchangeFile(file, sceneRef, cadState.materials)

    for (const mat of result.materials) {
      if (!cadState.materials.some((entry) => entry.id === mat.id)) {
        cadState.materials = [...cadState.materials, mat]
      }
    }

    for (const obj of result.objects) {
      objCounter++
      sceneRef.add(obj.mesh)
      cadState.objects = [...cadState.objects, obj]
      cadState.rootNodeIds = [...cadState.rootNodeIds, obj.id]
    }

    refreshMaterials()
    if (result.objects[0]) selectObject(result.objects[0].id)
    bump()
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not import file.')
  }
}

export async function loadSceneFromJson() {
  if (!sceneRef) return
  const json = await pickSceneFile()
  if (!json) return

  try {
    beginHistoryAction()
    for (const obj of cadState.objects) disposeObject(obj)

    const { objects, groups, rootNodeIds, counter, materials } = deserializeScene(json, sceneRef)
    objCounter = counter
    groupCounter = groups.length
    cadState.objects = objects
    cadState.groups = groups
    cadState.rootNodeIds = rootNodeIds
    cadState.materials = materials.map((mat) => ({ ...mat }))
    syncSceneObjectOrder()
    refreshMaterials()
    await Promise.all(objects.map((obj) => restoreUvTextureFromUrl(obj)))
    refreshMaterials()
    selectObject(objects[0]?.id ?? null)
  } catch {
    alert('Could not load scene file. Check that it is valid JSON.')
  }
}

export function initDefaultScene() {
  addObject('box', false)
  if (cadState.objects[0]) selectObject(cadState.objects[0].id)
  clearHistory()
}

export function vertexCount(): number {
  const sel = getSelected()
  if (!sel) return 0
  return sel.mesh.geometry.attributes.position?.count ?? 0
}

export function statusSelection(): string {
  const sel = getSelected()
  return sel ? `Selected: ${sel.name}` : 'Nothing selected'
}
