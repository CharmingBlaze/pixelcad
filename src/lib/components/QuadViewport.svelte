<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    OrthographicCamera,
    Plane,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Spherical,
    Vector2,
    Vector3,
    WebGLRenderer,
  } from 'three'
  import {
    bindScene,
    cadState,
    addObjectInBox,
    commitPolyDraw,
    cancelDrawPrimitive,
    cancelDrawPoly,
    cancelBevel,
    cancelExtrude,
    cancelInset,
    cancelSubdivide,
    commitBevel,
    commitExtrudeFaces,
    commitInsetFaces,
    commitSubdivide,
    initDefaultScene,
    refreshObject,
  } from '../cad/cadState.svelte'
  import { beginHistoryAction } from '../cad/history.svelte'
  import { getDrawPrimitiveTool, initDrawPrimitiveTool } from '../cad/drawPrimitiveTool'
  import { getPolyDrawTool, initPolyDrawTool } from '../cad/polyDrawTool'
  import { getExtrudeFaceTool, initExtrudeFaceTool } from '../cad/extrudeFaceTool'
  import { getBevelTool, initBevelTool } from '../cad/bevelTool'
  import { getInsetFaceTool, initInsetFaceTool } from '../cad/insetFaceTool'
  import { getSubdivideTool, initSubdivideTool } from '../cad/subdivideTool'
  import { marqueeSelect } from '../cad/marqueeSelection'
  import { grabMoveBySelection } from '../cad/operations'
  import { hoverAt, pickAt } from '../cad/picking'
  import { createCadScene } from '../cad/sceneSetup'
  import { selectedVertexIndices, selectionCenterWorld } from '../cad/selectionGeometry'
  import { getSubHelperObjects, rebuildSubHelpers } from '../cad/subHelpers'
  import { EDIT_HELPER_LIMITS } from '../cad/editPerformance'
  import { registerViewportBridge } from '../cad/viewportBridge'
  import type { ViewportRuntime } from '../cad/viewportRuntime'
  import {
    VIEWPORT_CONFIGS,
    createCamera,
    createInteraction,
    updateOrthoAspect,
    updatePerspAspect,
  } from '../cad/viewports'
  import {
    setQuadSplit,
    setSecondaryViewport,
    setSplit,
    setViewportLayoutMode,
    toggleViewportMaximize,
    viewportLayout,
    type ViewportLayoutMode,
  } from '../cad/viewportLayout.svelte'
  import CadTransformGizmo from './CadTransformGizmo.svelte'
  import PerspectiveViewportGizmo from './PerspectiveViewportGizmo.svelte'
  import UvEditor from './UvEditor.svelte'
  import { shortcutHint } from '../cad/shortcuts'
  import {
    PERSP_GIZMO_CLASS,
    PERSP_VP_INDEX,
    type PerspectiveGizmoApi,
  } from '../cad/perspectiveViewportGizmo'

  let quadContainer = $state<HTMLDivElement>()
  let vpEls: HTMLDivElement[] = []
  let canvases: HTMLCanvasElement[] = []
  let activeVp = $state(1)

  let scene = $state<Scene | null>(null)
  let viewports = $state<ViewportRuntime[]>([])
  let gizmoDragging = false
  let grabHistoryStarted = false
  let marqueeStart:
    | {
        vpIndex: number
        x: number
        y: number
      }
    | null = null
  let marqueeBox = $state<{
    vpIndex: number
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  let grabDrag:
    | {
        vp: ViewportRuntime
        plane: Plane
        lastPoint: Vector3
        anchorWorld: Vector3
      }
    | null = null
  let perspGizmoApi = $state<PerspectiveGizmoApi | null>(null)
  let perspGizmoInteracting = false
  let transformGizmoApi:
    | {
        prepareViewport: (vp: ViewportRuntime) => void
        setVisible: (visible: boolean) => void
        isActive: () => boolean
      }
    | null = null
  let resizeCleanup: (() => void) | null = null
  let hoverFrame = 0
  let pendingHover:
    | { vp: ViewportRuntime; clientX: number; clientY: number }
    | null = null
  const dragRaycaster = new Raycaster()
  const dragNdc = new Vector2()

  function isDrawingPrimitive() {
    return cadState.activeTool === 'drawbox' && !!cadState.drawPrimitiveType
  }

  function isDrawingPoly() {
    return cadState.activeTool === 'drawpoly' && !!cadState.drawPolyMode
  }

  function isExtruding() {
    return cadState.activeTool === 'extrudeface' && !!getExtrudeFaceTool()?.active
  }

  function isBeveling() {
    return cadState.activeTool === 'bevel' && !!getBevelTool()?.active
  }

  function isInsetting() {
    return cadState.activeTool === 'insetface' && !!getInsetFaceTool()?.active
  }

  function isSubdividing() {
    return cadState.activeTool === 'subdividetool' && !!getSubdivideTool()?.active
  }

  function isActiveDrawTool() {
    return (
      isDrawingPrimitive() ||
      isDrawingPoly() ||
      isExtruding() ||
      isInsetting() ||
      isSubdividing() ||
      isBeveling()
    )
  }

  function drawPointerTarget(vp: ViewportRuntime) {
    return {
      camera: vp.camera,
      element: vp.el,
      sceneMeshes: cadState.objects.map((o) => o.mesh),
    }
  }

  function polyDrawSettings() {
    return {
      space: cadState.polyDrawSpace,
      surface: cadState.polyDrawSurface,
      snap: cadState.transformSnap,
    }
  }

  function syncPerspGizmo(vp: ViewportRuntime) {
    if (vp.config.id === 'persp') perspGizmoApi?.syncTarget()
  }

  function bindVp(node: HTMLDivElement, index: number) {
    vpEls[index] = node
    return {
      destroy() {
        delete vpEls[index]
      },
    }
  }

  function bindCanvas(node: HTMLCanvasElement, index: number) {
    canvases[index] = node
    return {
      destroy() {
        delete canvases[index]
      },
    }
  }

  function getActiveViewport(): ViewportRuntime {
    return viewports[activeVp] ?? viewports[1]
  }

  function getViewportAtPoint(clientX: number, clientY: number): ViewportRuntime | null {
    for (let i = 0; i < viewports.length; i++) {
      if (!isViewportVisible(i)) continue
      const vp = viewports[i]
      const r = vp.el.getBoundingClientRect()
      if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) {
        return vp
      }
    }
    return null
  }

  function activateViewport(index: number) {
    activeVp = index
    cadState.activeViewport = index
    if (viewportLayout.mode !== 'quad' && viewportLayout.secondaryViewport === index) {
      setSecondaryViewport(fallbackSecondaryViewport(index))
    }
    const vp = viewports[index]
    if (vp) transformGizmoApi?.prepareViewport(vp)
  }

  function fallbackSecondaryViewport(primary: number): number {
    if (primary !== PERSP_VP_INDEX) return PERSP_VP_INDEX
    return 0
  }

  function secondaryViewport(): number {
    if (viewportLayout.secondaryViewport === activeVp) return fallbackSecondaryViewport(activeVp)
    return viewportLayout.secondaryViewport
  }

  function isViewportVisible(index: number): boolean {
    if (viewportLayout.mode === 'quad') return true
    if (viewportLayout.mode === 'single') return index === activeVp
    if (viewportLayout.mode === 'uvEditor') return index === activeVp
    return index === activeVp || index === secondaryViewport()
  }

  function viewportStyle(index: number): string {
    if (viewportLayout.mode === 'single') return 'grid-column: 1 / 3; grid-row: 1 / 3;'
    if (viewportLayout.mode === 'uvEditor') {
      if (index !== activeVp) return 'display: none;'
      return 'grid-column: 1; grid-row: 1 / 3;'
    }
    if (viewportLayout.mode === 'splitVertical') {
      return index === activeVp ? 'grid-column: 1; grid-row: 1 / 3;' : 'grid-column: 2; grid-row: 1 / 3;'
    }
    if (viewportLayout.mode === 'splitHorizontal') {
      return index === activeVp ? 'grid-column: 1 / 3; grid-row: 1;' : 'grid-column: 1 / 3; grid-row: 2;'
    }

    const col = index % 2 === 0 ? 1 : 2
    const row = index < 2 ? 1 : 2
    return `grid-column: ${col}; grid-row: ${row};`
  }

  function layoutTemplateStyle(): string {
    const quadX = `${viewportLayout.quadSplitX * 100}% ${100 - viewportLayout.quadSplitX * 100}%`
    const quadY = `${viewportLayout.quadSplitY * 100}% ${100 - viewportLayout.quadSplitY * 100}%`
    const splitX = `${viewportLayout.splitX * 100}% ${100 - viewportLayout.splitX * 100}%`
    const splitY = `${viewportLayout.splitY * 100}% ${100 - viewportLayout.splitY * 100}%`

    if (viewportLayout.mode === 'single') {
      return 'grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;'
    }
    if (viewportLayout.mode === 'splitVertical' || viewportLayout.mode === 'uvEditor') {
      return `grid-template-columns: ${splitX}; grid-template-rows: 1fr 1fr;`
    }
    if (viewportLayout.mode === 'splitHorizontal') {
      return `grid-template-columns: 1fr 1fr; grid-template-rows: ${splitY};`
    }
    return `grid-template-columns: ${quadX}; grid-template-rows: ${quadY};`
  }

  function setLayout(mode: ViewportLayoutMode) {
    if (mode !== 'quad') setSecondaryViewport(fallbackSecondaryViewport(activeVp))
    setViewportLayoutMode(mode)
    void tick().then(resizeAll)
  }

  function startResize(kind: 'quadX' | 'quadY' | 'splitX' | 'splitY', e: PointerEvent) {
    if (!quadContainer) return
    e.preventDefault()
    e.stopPropagation()

    resizeCleanup?.()

    const move = (event: PointerEvent) => {
      if (!quadContainer) return
      const rect = quadContainer.getBoundingClientRect()
      const x = (event.clientX - rect.left) / Math.max(1, rect.width)
      const y = (event.clientY - rect.top) / Math.max(1, rect.height)
      if (kind === 'quadX') setQuadSplit('x', x)
      else if (kind === 'quadY') setQuadSplit('y', y)
      else if (kind === 'splitX') setSplit('x', x)
      else setSplit('y', y)
      resizeAll()
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      resizeCleanup = null
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    resizeCleanup = up
  }

  function resizeAll() {
    viewports.forEach((vp) => {
      const w = vp.el.clientWidth
      const h = vp.el.clientHeight
      if (w < 1 || h < 1) return
      vp.renderer.setSize(w, h, false)
      if (vp.config.id === 'persp') perspGizmoApi?.gizmo.update()
      const aspect = w / h
      if (vp.config.ortho && vp.camera instanceof OrthographicCamera) {
        updateOrthoAspect(vp.camera, aspect)
      } else if (!vp.config.ortho && vp.camera instanceof PerspectiveCamera) {
        updatePerspAspect(vp.camera, aspect)
      }
    })
  }

  function scheduleHover(vp: ViewportRuntime, clientX: number, clientY: number) {
    pendingHover = { vp, clientX, clientY }
    if (hoverFrame) return

    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      const hover = pendingHover
      pendingHover = null
      if (!hover) return
      hoverAt(hover.vp.camera, hover.vp.el, hover.clientX, hover.clientY, getSubHelperObjects())
    })
  }

  function panViewport(vp: ViewportRuntime, dx: number, dy: number) {
    const cam = vp.camera
    const intr = vp.interaction
    const right = new Vector3()
    right.crossVectors(cam.getWorldDirection(new Vector3()), cam.up).normalize()
    const up = cam.up.clone().normalize()

    if (vp.config.ortho && cam instanceof OrthographicCamera) {
      const spd = (cam.right - cam.left) / Math.max(1, vp.canvas.clientWidth) / cam.zoom
      intr.orbitTarget.addScaledVector(right, -dx * spd)
      intr.orbitTarget.addScaledVector(up, dy * spd)
      cam.position.addScaledVector(right, -dx * spd)
      cam.position.addScaledVector(up, dy * spd)
      cam.lookAt(intr.orbitTarget)
    } else {
      const spd = cam.position.distanceTo(intr.orbitTarget) * 0.002
      intr.orbitTarget.addScaledVector(right, -dx * spd)
      intr.orbitTarget.addScaledVector(up, dy * spd)
      cam.position.addScaledVector(right, -dx * spd)
      cam.position.addScaledVector(up, dy * spd)
      cam.lookAt(intr.orbitTarget)
    }
    syncPerspGizmo(vp)
  }

  function orbitViewport(vp: ViewportRuntime, dx: number, dy: number) {
    const cam = vp.camera
    const intr = vp.interaction
    const sph = new Spherical().setFromVector3(cam.position.clone().sub(intr.orbitTarget))
    sph.theta -= dx * 0.008
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi - dy * 0.008))
    cam.position.copy(new Vector3().setFromSpherical(sph).add(intr.orbitTarget))
    cam.lookAt(intr.orbitTarget)
    syncPerspGizmo(vp)
  }

  function pointerWorldOnViewPlane(
    vp: ViewportRuntime,
    clientX: number,
    clientY: number,
    anchorWorld: Vector3,
  ): Vector3 | null {
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      vp.camera.getWorldDirection(new Vector3()).normalize(),
      anchorWorld,
    )
    return pointerOnDragPlane(vp, clientX, clientY, plane)
  }

  function zoomViewport(vp: ViewportRuntime, deltaY: number, clientX: number, clientY: number) {
    const cam = vp.camera
    const intr = vp.interaction
    if (vp.config.ortho && cam instanceof OrthographicCamera) {
      const before = pointerWorldOnViewPlane(vp, clientX, clientY, intr.orbitTarget)
      const factor = deltaY > 0 ? 0.9 : 1.1
      cam.zoom = Math.max(0.08, Math.min(80, cam.zoom * factor))
      cam.updateProjectionMatrix()
      const after = pointerWorldOnViewPlane(vp, clientX, clientY, intr.orbitTarget)
      if (before && after) {
        const offset = before.sub(after)
        cam.position.add(offset)
        intr.orbitTarget.add(offset)
        cam.lookAt(intr.orbitTarget)
      }
    } else {
      const dir = cam.position.clone().sub(intr.orbitTarget).normalize()
      const dist = cam.position.distanceTo(intr.orbitTarget)
      const nd = Math.max(0.3, Math.min(200, dist * (1 + deltaY * 0.001)))
      cam.position.copy(intr.orbitTarget.clone().add(dir.multiplyScalar(nd)))
    }
    syncPerspGizmo(vp)
  }

  function worldUnitsPerPixel(vp: ViewportRuntime, anchorWorld: Vector3): number {
    if (vp.camera instanceof OrthographicCamera) {
      return (vp.camera.top - vp.camera.bottom) / Math.max(1, vp.el.clientHeight) / vp.camera.zoom
    }

    if (vp.camera instanceof PerspectiveCamera) {
      const distance = Math.max(0.01, vp.camera.position.distanceTo(anchorWorld))
      const fov = (vp.camera.fov * Math.PI) / 180
      return (2 * Math.tan(fov / 2) * distance) / Math.max(1, vp.el.clientHeight)
    }

    return 0.02
  }

  function clampDragDelta(vp: ViewportRuntime, anchorWorld: Vector3, delta: Vector3): Vector3 {
    const maxStep = worldUnitsPerPixel(vp, anchorWorld) * 96
    if (!Number.isFinite(maxStep) || maxStep <= 0) return new Vector3()
    const length = delta.length()
    if (!Number.isFinite(length)) return new Vector3()
    if (length <= maxStep) return delta
    return delta.setLength(maxStep)
  }

  function pointerOnDragPlane(
    vp: ViewportRuntime,
    clientX: number,
    clientY: number,
    plane: Plane,
  ): Vector3 | null {
    const rect = vp.el.getBoundingClientRect()
    dragNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    dragRaycaster.setFromCamera(dragNdc, vp.camera)
    return dragRaycaster.ray.intersectPlane(plane, new Vector3())
  }

  function pointerLocal(vp: ViewportRuntime, clientX: number, clientY: number) {
    const rect = vp.el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    }
  }

  function updateMarqueeBox(vp: ViewportRuntime, clientX: number, clientY: number) {
    if (!marqueeStart) return
    const current = pointerLocal(vp, clientX, clientY)
    const left = Math.min(marqueeStart.x, current.x)
    const top = Math.min(marqueeStart.y, current.y)
    marqueeBox = {
      vpIndex: marqueeStart.vpIndex,
      left,
      top,
      width: Math.abs(current.x - marqueeStart.x),
      height: Math.abs(current.y - marqueeStart.y),
    }
  }

  function grabAnchorWorld(): Vector3 | null {
    const sel = cadState.objects.find((o) => o.id === cadState.selectedId)
    if (!sel) return null
    if (cadState.editMode === 'object') return sel.mesh.getWorldPosition(new Vector3())

    const vertices = selectedVertexIndices(
      sel.mesh,
      cadState.editMode,
      cadState.selVerts,
      cadState.selEdges,
      cadState.selFaces,
    )
    return selectionCenterWorld(sel.mesh, vertices)
  }

  function startGrabDrag(vp: ViewportRuntime, clientX: number, clientY: number): boolean {
    const anchorWorld = grabAnchorWorld()
    if (!anchorWorld) return false

    const normal = vp.camera.getWorldDirection(new Vector3()).normalize()
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, anchorWorld)
    const lastPoint = pointerOnDragPlane(vp, clientX, clientY, plane)
    if (!lastPoint) return false

    grabDrag = { vp, plane, lastPoint, anchorWorld: anchorWorld.clone() }
    return true
  }

  function grabInViewport(vp: ViewportRuntime, clientX: number, clientY: number) {
    const sel = cadState.objects.find((o) => o.id === cadState.selectedId)
    if (!sel) return
    if (!grabDrag && !startGrabDrag(vp, clientX, clientY)) return
    if (!grabDrag || grabDrag.vp !== vp) return

    const point = pointerOnDragPlane(vp, clientX, clientY, grabDrag.plane)
    if (!point) return

    const worldDelta = clampDragDelta(
      vp,
      grabDrag.anchorWorld,
      point.clone().sub(grabDrag.lastPoint),
    )
    if (worldDelta.lengthSq() < 0.00000001) return
    let moveDelta = worldDelta

    if (cadState.editMode !== 'object') {
      const localStart = sel.mesh.worldToLocal(grabDrag.anchorWorld.clone())
      const localEnd = sel.mesh.worldToLocal(grabDrag.anchorWorld.clone().add(worldDelta))
      moveDelta = localEnd.sub(localStart)
    }

    const realtimeOutline =
      sel.stats.vertices <= EDIT_HELPER_LIMITS.vertices &&
      sel.stats.edges <= EDIT_HELPER_LIMITS.edges &&
      sel.stats.faces <= EDIT_HELPER_LIMITS.faces

    grabMoveBySelection(
      sel.mesh,
      cadState.editMode,
      cadState.selVerts,
      cadState.selEdges,
      cadState.selFaces,
      moveDelta,
      realtimeOutline,
    )
    grabDrag.lastPoint.copy(point)
    grabDrag.anchorWorld.add(worldDelta)
    cadState.revision++
  }

  function setupPointerHandlers(vp: ViewportRuntime, index: number): () => void {
    const intr = vp.interaction

    const onPointerDown = (e: PointerEvent) => {
      if (gizmoDragging || perspGizmoInteracting) return
      if ((e.target as HTMLElement).closest(`.${PERSP_GIZMO_CLASS}`)) return
      activateViewport(index)

      if (isActiveDrawTool()) {
        e.preventDefault()
        if (e.button === 2) {
          cancelDrawPrimitive()
          cancelDrawPoly()
          cancelExtrude()
          cancelInset()
          cancelSubdivide()
          cancelBevel()
          return
        }
        if (e.button === 0) {
          if (isBeveling()) {
            getBevelTool()?.commit()
            return
          }
          if (isInsetting()) {
            getInsetFaceTool()?.commit()
            return
          }
          if (isSubdividing()) {
            getSubdivideTool()?.commit()
            return
          }
          if (isExtruding()) {
            getExtrudeFaceTool()?.commit()
            return
          }
          if (isDrawingPoly()) {
            getPolyDrawTool()?.handleClick(
              drawPointerTarget(vp),
              e.clientX,
              e.clientY,
              polyDrawSettings(),
            )
          } else {
            getDrawPrimitiveTool()?.handleClick(
              drawPointerTarget(vp),
              e.clientX,
              e.clientY,
              cadState.transformSnap,
            )
          }
        }
        return
      }

      if (gizmoDragging) return
      intr.mouseDown = true
      intr.btn = e.button
      intr.lastX = e.clientX
      intr.lastY = e.clientY
      intr.dragDist = 0
      grabHistoryStarted = false
      grabDrag = null
      marqueeBox = null
      marqueeStart =
        e.button === 0 && cadState.activeTool === 'select' && !e.altKey
          ? { vpIndex: index, ...pointerLocal(vp, e.clientX, e.clientY) }
          : null

      if (e.button === 0 && cadState.activeTool === 'grab' && cadState.editMode !== 'object') {
        pickAt(
          vp.camera,
          vp.el,
          e.clientX,
          e.clientY,
          cadState.objects.map((o) => o.mesh),
          getSubHelperObjects(),
          e.shiftKey || e.ctrlKey || e.metaKey,
        )
      }

      const gizmoActive = cadState.editMode === 'object' && !!cadState.selectedId
      if (!(gizmoActive && e.button === 0)) e.preventDefault()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (gizmoDragging || perspGizmoInteracting) return

      if (isActiveDrawTool()) {
        if (getViewportAtPoint(e.clientX, e.clientY) !== vp) return
        if (isExtruding()) {
          getExtrudeFaceTool()?.handleMove(e.clientY, cadState.transformSnap)
          return
        }
        if (isInsetting()) {
          getInsetFaceTool()?.handleMove(e.clientY, cadState.transformSnap)
          return
        }
        if (isSubdividing()) {
          getSubdivideTool()?.handleMove(e.clientY, cadState.transformSnap)
          return
        }
        if (isBeveling()) {
          getBevelTool()?.handleMove(e.clientY, cadState.transformSnap)
          return
        }
        if (isDrawingPoly()) {
          getPolyDrawTool()?.handleMove(
            drawPointerTarget(vp),
            e.clientX,
            e.clientY,
            polyDrawSettings(),
          )
          return
        }
        const tool = getDrawPrimitiveTool()
        const bounds = tool?.currentBounds()
        const anchor = bounds
          ? bounds.min.clone().add(bounds.max).multiplyScalar(0.5)
          : new Vector3()
        tool?.handleMove(
          drawPointerTarget(vp),
          e.clientX,
          e.clientY,
          cadState.transformSnap,
          worldUnitsPerPixel(vp, anchor),
        )
        return
      }

      if (!intr.mouseDown) {
        const hoverVp = getViewportAtPoint(e.clientX, e.clientY)
        if (hoverVp === vp) scheduleHover(vp, e.clientX, e.clientY)
        return
      }
      const dx = e.clientX - intr.lastX
      const dy = e.clientY - intr.lastY
      intr.dragDist += Math.sqrt(dx * dx + dy * dy)
      intr.lastX = e.clientX
      intr.lastY = e.clientY

      if (intr.btn === 1 || (intr.btn === 0 && e.altKey)) {
        panViewport(vp, dx, dy)
      } else if (intr.btn === 2 && !vp.config.ortho) {
        orbitViewport(vp, dx, dy)
      } else if (
        intr.btn === 0 &&
        cadState.activeTool === 'select' &&
        marqueeStart?.vpIndex === index &&
        intr.dragDist > 5
      ) {
        updateMarqueeBox(vp, e.clientX, e.clientY)
      } else if (
        intr.btn === 0 &&
        cadState.activeTool === 'grab' &&
        intr.dragDist > 3 &&
        (cadState.editMode !== 'object' || cadState.selectedId)
      ) {
        if (!grabHistoryStarted) {
          beginHistoryAction()
          grabHistoryStarted = true
        }
        grabInViewport(vp, e.clientX, e.clientY)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (gizmoDragging || perspGizmoInteracting || !intr.mouseDown) return
      const wasGrabDragging = grabHistoryStarted
      const box = marqueeBox
      if (
        box &&
        box.vpIndex === index &&
        box.width > 4 &&
        box.height > 4 &&
        cadState.activeTool === 'select'
      ) {
        marqueeSelect(
          vp.camera,
          vp.el,
          {
            left: box.left,
            top: box.top,
            right: box.left + box.width,
            bottom: box.top + box.height,
          },
          e.shiftKey || e.ctrlKey || e.metaKey,
        )
      }
      if (
        !box &&
        intr.dragDist < 4 &&
        intr.btn === 0 &&
        !(cadState.activeTool === 'grab' && cadState.editMode !== 'object')
      ) {
        const meshes = cadState.objects.map((o) => o.mesh)
        pickAt(
          vp.camera,
          vp.el,
          e.clientX,
          e.clientY,
          meshes,
          getSubHelperObjects(),
          e.shiftKey || e.ctrlKey || e.metaKey,
        )
      }
      intr.mouseDown = false
      intr.btn = -1
      grabDrag = null
      marqueeStart = null
      marqueeBox = null
      if (wasGrabDragging) {
        const sel = cadState.objects.find((o) => o.id === cadState.selectedId)
        if (sel) refreshObject(sel)
        grabHistoryStarted = false
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const drawTool = getDrawPrimitiveTool()
      if (isDrawingPrimitive() && drawTool?.phase === 'height' && getViewportAtPoint(e.clientX, e.clientY) === vp) {
        drawTool.handleWheel(e.deltaY, cadState.transformSnap)
        return
      }
      if (isExtruding() && getViewportAtPoint(e.clientX, e.clientY) === vp) {
        getExtrudeFaceTool()?.handleWheel(e.deltaY, cadState.transformSnap)
        return
      }
      if (isInsetting() && getViewportAtPoint(e.clientX, e.clientY) === vp) {
        getInsetFaceTool()?.handleWheel(e.deltaY, cadState.transformSnap)
        return
      }
      if (isSubdividing() && getViewportAtPoint(e.clientX, e.clientY) === vp) {
        getSubdivideTool()?.handleWheel(e.deltaY, cadState.transformSnap)
        return
      }
      if (isBeveling() && getViewportAtPoint(e.clientX, e.clientY) === vp) {
        getBevelTool()?.handleWheel(e.deltaY, cadState.transformSnap)
        return
      }
      zoomViewport(vp, e.deltaY, e.clientX, e.clientY)
    }

    const onPointerLeave = () => {
      if (!intr.mouseDown) hoverAt(vp.camera, vp.el, -1, -1, [])
    }

    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    vp.el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    vp.el.addEventListener('wheel', onWheel, { passive: false })
    vp.el.addEventListener('pointerleave', onPointerLeave)
    vp.el.addEventListener('contextmenu', onContextMenu)

    return () => {
      vp.el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      vp.el.removeEventListener('wheel', onWheel)
      vp.el.removeEventListener('pointerleave', onPointerLeave)
      vp.el.removeEventListener('contextmenu', onContextMenu)
    }
  }

  onMount(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void (async () => {
      await tick()
      if (disposed || !quadContainer) return
      for (let i = 0; i < 4; i++) {
        if (!vpEls[i] || !canvases[i]) return
      }

      const cadScene = createCadScene()
      scene = cadScene
      bindScene(cadScene)
      initDefaultScene()

      const drawTool = initDrawPrimitiveTool(cadScene)
      drawTool.onCommit = (type, bounds) => {
        addObjectInBox(type, bounds.min, bounds.max)
      }

      const polyTool = initPolyDrawTool(cadScene)
      polyTool.onCommit = (vertices, indices, mode, space) => {
        commitPolyDraw(vertices, indices, mode, space)
      }

      const extrudeTool = initExtrudeFaceTool(cadScene)
      extrudeTool.onCommit = (distance) => {
        commitExtrudeFaces(distance)
      }

      const bevelTool = initBevelTool(cadScene)
      bevelTool.onCommit = (width, edgeIds) => {
        commitBevel(width, edgeIds)
      }

      const insetTool = initInsetFaceTool(cadScene)
      insetTool.onCommit = (amount, faceIndices) => {
        commitInsetFaces(amount, faceIndices)
      }

      const subdivideTool = initSubdivideTool(cadScene)
      subdivideTool.onCommit = (cuts, smooth, faceIndices) => {
        commitSubdivide(cuts, smooth, faceIndices)
      }

      viewports = VIEWPORT_CONFIGS.map((cfg, i) => {
        const el = vpEls[i]
        const canvas = canvases[i]
        const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
        renderer.setPixelRatio(window.devicePixelRatio || 1)
        const camera = createCamera(cfg)
        return {
          el,
          canvas,
          renderer,
          camera,
          config: cfg,
          interaction: createInteraction(),
        }
      })

      cadState.activeViewport = activeVp
      resizeAll()

      registerViewportBridge({
        getActiveCamera: () => getActiveViewport().camera,
        getActiveViewportRect: () => getActiveViewport().el.getBoundingClientRect(),
        setGizmoDragging: (dragging) => {
          gizmoDragging = dragging
        },
        isGizmoDragging: () => gizmoDragging,
      })

      const ro = new ResizeObserver(resizeAll)
      ro.observe(quadContainer)

      const pointerCleanups = viewports.map((vp, i) => setupPointerHandlers(vp, i))

      let rafId = 0
      const animate = () => {
        rafId = requestAnimationFrame(animate)
        const showTransformGizmo = transformGizmoApi?.isActive() ?? false
        for (let i = 0; i < viewports.length; i++) {
          if (!isViewportVisible(i)) continue
          const vp = viewports[i]
          if (showTransformGizmo) {
            transformGizmoApi?.prepareViewport(vp)
            transformGizmoApi?.setVisible(true)
          } else {
            transformGizmoApi?.setVisible(false)
          }
          vp.renderer.render(cadScene, vp.camera)
          if (vp.config.id === 'persp') perspGizmoApi?.render()
        }
      }
      animate()

      cleanup = () => {
        cancelAnimationFrame(rafId)
        if (hoverFrame) cancelAnimationFrame(hoverFrame)
        cancelDrawPrimitive()
        cancelDrawPoly()
        cancelExtrude()
        cancelInset()
        cancelSubdivide()
        cancelBevel()
        getDrawPrimitiveTool()?.detachScene()
        getPolyDrawTool()?.detachScene()
        getExtrudeFaceTool()?.detachScene()
        getInsetFaceTool()?.detachScene()
        getSubdivideTool()?.detachScene()
        getBevelTool()?.detachScene()
        registerViewportBridge(null)
        ro.disconnect()
      resizeCleanup?.()
      marqueeStart = null
      marqueeBox = null
      pointerCleanups.forEach((dispose) => dispose())
        viewports.forEach((vp) => vp.renderer.dispose())
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  })

  $effect(() => {
    cadState.revision
    cadState.editMode
    cadState.activeTool
    cadState.drawPolyMode
    cadState.selectedId
    cadState.selVerts
    cadState.selEdges
    cadState.selFaces
    cadState.hoverVert
    cadState.hoverEdge
    cadState.hoverFace
    rebuildSubHelpers()
  })

  $effect(() => {
    viewportLayout.mode
    viewportLayout.quadSplitX
    viewportLayout.quadSplitY
    viewportLayout.splitX
    viewportLayout.splitY
    viewportLayout.secondaryViewport
    void tick().then(resizeAll)
  })
</script>

<div class="quad-shell">
  {#if viewportLayout.mode !== 'uvEditor'}
    <div class="layout-bar" aria-label="Viewport layout">
      <button class:active={viewportLayout.mode === 'quad'} type="button" title={shortcutHint('Quad view', 'view:quad')} onclick={() => setLayout('quad')}>Quad</button>
      <button class:active={viewportLayout.mode === 'splitVertical'} type="button" title={shortcutHint('Vertical split', 'view:splitVertical')} onclick={() => setLayout('splitVertical')}>Vertical</button>
      <button class:active={viewportLayout.mode === 'splitHorizontal'} type="button" title={shortcutHint('Horizontal split', 'view:splitHorizontal')} onclick={() => setLayout('splitHorizontal')}>Horizontal</button>
      <button class:active={viewportLayout.mode === 'single'} type="button" title={shortcutHint('Maximize view', 'viewport:maximize')} onclick={() => toggleViewportMaximize()}>Max</button>
    </div>
  {/if}

<div
  class="quad-grid"
  class:single={viewportLayout.mode === 'single'}
  class:split-vertical={viewportLayout.mode === 'splitVertical' || viewportLayout.mode === 'uvEditor'}
  class:split-horizontal={viewportLayout.mode === 'splitHorizontal'}
  style={layoutTemplateStyle()}
  bind:this={quadContainer}
>
  {#each VIEWPORT_CONFIGS as cfg, i (cfg.id)}
    <div
      class="vp"
      class:vp-hidden={!isViewportVisible(i)}
      class:vp-active={activeVp === i}
      style={viewportStyle(i)}
      use:bindVp={i}
    >
      <canvas use:bindCanvas={i}></canvas>
      {#if cfg.id === 'persp' && viewports[PERSP_VP_INDEX]?.camera instanceof PerspectiveCamera}
        <PerspectiveViewportGizmo
          camera={viewports[PERSP_VP_INDEX].camera}
          renderer={viewports[PERSP_VP_INDEX].renderer}
          container={viewports[PERSP_VP_INDEX].el}
          interaction={viewports[PERSP_VP_INDEX].interaction}
          onReady={(api) => (perspGizmoApi = api)}
          onInteractingChange={(v) => (perspGizmoInteracting = v)}
        />
      {/if}
      <div class="vp-label">{cfg.label}</div>
      {#if marqueeBox && marqueeBox.vpIndex === i}
        <div
          class="selection-marquee"
          style={`left: ${marqueeBox.left}px; top: ${marqueeBox.top}px; width: ${marqueeBox.width}px; height: ${marqueeBox.height}px;`}
        ></div>
      {/if}
    </div>
  {/each}

  {#if viewportLayout.mode === 'uvEditor'}
    <div class="uv-pane" style="grid-column: 2; grid-row: 1 / 3;">
      <UvEditor />
    </div>
  {/if}

  {#if viewportLayout.mode === 'quad'}
    <button
      class="splitter splitter-v"
      style={`left: ${viewportLayout.quadSplitX * 100}%`}
      type="button"
      aria-label="Resize viewport columns"
      onpointerdown={(e) => startResize('quadX', e)}
    ></button>
    <button
      class="splitter splitter-h"
      style={`top: ${viewportLayout.quadSplitY * 100}%`}
      type="button"
      aria-label="Resize viewport rows"
      onpointerdown={(e) => startResize('quadY', e)}
    ></button>
  {:else if viewportLayout.mode === 'splitVertical' || viewportLayout.mode === 'uvEditor'}
    <button
      class="splitter splitter-v"
      style={`left: ${viewportLayout.splitX * 100}%`}
      type="button"
      aria-label="Resize split view"
      onpointerdown={(e) => startResize('splitX', e)}
    ></button>
  {:else if viewportLayout.mode === 'splitHorizontal'}
    <button
      class="splitter splitter-h"
      style={`top: ${viewportLayout.splitY * 100}%`}
      type="button"
      aria-label="Resize split view"
      onpointerdown={(e) => startResize('splitY', e)}
    ></button>
  {/if}
</div>
</div>

{#if scene && viewports.length === 4}
  <CadTransformGizmo
    {scene}
    getActiveViewport={getActiveViewport}
    getViewportAtPoint={getViewportAtPoint}
    onReady={(api) => (transformGizmoApi = api)}
    onDraggingChange={(d) => (gizmoDragging = d)}
  />
{/if}

<style>
  .quad-grid {
    display: grid;
    position: relative;
    flex: 1;
    gap: 2px;
    min-height: 0;
    background: #111;
    overflow: hidden;
  }

  .quad-shell {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .layout-bar {
    position: absolute;
    top: 8px;
    right: 10px;
    display: flex;
    gap: 4px;
    padding: 3px;
    background: rgba(30, 30, 30, 0.88);
    border: 1px solid #353535;
    border-radius: 4px;
    z-index: 12;
  }

  .layout-bar button {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 3px;
    color: #b9c2cc;
    background: transparent;
    font-size: 11px;
  }

  .layout-bar button:hover,
  .layout-bar button.active {
    color: #e8f2ff;
    border-color: #2f6ebd;
    background: #174b87;
  }

  .vp {
    position: relative;
    overflow: hidden;
    cursor: crosshair;
    background: #1a1a1a;
    outline: 1px solid transparent;
    outline-offset: -1px;
  }

  .vp-hidden {
    display: none;
  }

  .vp canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .vp-label {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 11px;
    color: #7c8794;
    pointer-events: none;
    z-index: 2;
    font-family: monospace;
  }

  .vp.vp-active {
    outline-color: #3a7adc;
  }

  .vp.vp-active .vp-label {
    color: #9dccff;
  }

  .uv-pane {
    position: relative;
    z-index: 20;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    pointer-events: auto;
    isolation: isolate;
  }

  .selection-marquee {
    position: absolute;
    z-index: 8;
    pointer-events: none;
    border: 1px dashed #9ed0ff;
    background: rgba(65, 145, 255, 0.14);
    box-shadow:
      inset 0 0 0 1px rgba(6, 12, 22, 0.7),
      0 0 0 1px rgba(12, 33, 56, 0.9);
  }

  .splitter {
    position: absolute;
    z-index: 10;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .splitter::after {
    content: '';
    position: absolute;
    background: #2d2d2d;
    transition: background 120ms ease;
  }

  .splitter:hover::after,
  .splitter:focus-visible::after {
    background: #3a7adc;
  }

  .splitter-v {
    top: 0;
    bottom: 0;
    width: 10px;
    transform: translateX(-5px);
    cursor: col-resize;
  }

  .splitter-v::after {
    top: 0;
    bottom: 0;
    left: 4px;
    width: 2px;
  }

  .splitter-h {
    left: 0;
    right: 0;
    height: 10px;
    transform: translateY(-5px);
    cursor: row-resize;
  }

  .splitter-h::after {
    left: 0;
    right: 0;
    top: 4px;
    height: 2px;
  }
</style>
