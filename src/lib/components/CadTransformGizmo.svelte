<script lang="ts">
  import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
  import {
    MathUtils,
    Matrix4,
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
    Quaternion,
    Vector3,
    type Mesh,
    type Scene,
  } from 'three'
  import { onMount } from 'svelte'
  import { cadState, getSelected, refreshObject } from '../cad/cadState.svelte'
  import { beginHistoryAction } from '../cad/history.svelte'
  import { addWireEdges } from '../cad/operations'
  import {
    applyWorldMatrixToVertexSnapshot,
    meshBoundsCenterLocal,
    selectedVertexIndices,
    selectionCenterWorld,
  } from '../cad/selectionGeometry'
  import { rebuildSubHelpers } from '../cad/subHelpers'
  import { applyTransformGizmoColors } from '../cad/gizmoTheme'
  import { isReferenceImage, syncReferenceImageMaterial } from '../cad/referenceImage'
  import type { ViewportRuntime } from '../cad/viewportRuntime'

  let {
    scene,
    getActiveViewport,
    getViewportAtPoint,
    onReady,
    onDraggingChange,
  }: {
    scene: Scene
    getActiveViewport: () => ViewportRuntime
    getViewportAtPoint: (clientX: number, clientY: number) => ViewportRuntime | null
    onReady: (
      api: {
        prepareViewport: (vp: ViewportRuntime) => void
        setVisible: (visible: boolean) => void
        isActive: () => boolean
      } | null,
    ) => void
    onDraggingChange: (dragging: boolean) => void
  } = $props()

  let controls: TransformControls | undefined
  let historyStarted = false
  let currentViewport: ViewportRuntime | undefined
  let dragViewport: ViewportRuntime | undefined
  let subObjectPivot: Object3D | undefined
  let subObjectVertices = new Set<number>()
  let dragStartPivotWorld = new Matrix4()
  let pivotToMeshOffset = new Matrix4()
  let dragOriginalPositions = new Map<number, Vector3>()
  let dragStartMeshScale = new Vector3(1, 1, 1)
  let dragStartMeshPosition = new Vector3()
  let applyingSubObject = false
  let applyingObjectTransform = false

  type TransformDomAdapter = HTMLElement & {
    setCurrentViewport: (vp: ViewportRuntime) => void
  }

  function prepareViewport(vp: ViewportRuntime) {
    currentViewport = vp
    if (!controls) return
    controls.camera = vp.camera
    ;(controls.domElement as TransformDomAdapter | null)?.setCurrentViewport?.(vp)
    vp.camera.updateMatrixWorld(true)
    if (vp.camera instanceof PerspectiveCamera || vp.camera instanceof OrthographicCamera) {
      vp.camera.updateProjectionMatrix()
    }
    controls.getHelper().updateMatrixWorld(true)
  }

  function setControlsVisible(visible: boolean) {
    if (!controls) return
    controls.getHelper().visible = visible && controls.enabled
  }

  function isTransformActive() {
    return !!(controls?.enabled && controls.object)
  }

  function createDomAdapter(container: HTMLElement): TransformDomAdapter {
    const listeners = new Map<EventListenerOrEventListenerObject, EventListener>()
    let viewport = getActiveViewport()

    const listenerOptions = (options?: boolean | AddEventListenerOptions | EventListenerOptions) => {
      if (typeof options === 'boolean') return { capture: true }
      return { ...options, capture: true }
    }

    const syncViewportFromEvent = (event: Event) => {
      if (!(event instanceof PointerEvent)) return
      if (controls?.dragging && dragViewport) {
        prepareViewport(dragViewport)
        viewport = dragViewport
        return
      }
      const hit = getViewportAtPoint(event.clientX, event.clientY)
      if (hit) prepareViewport(hit)
    }

    const isViewportPointerTarget = (event: Event) => {
      if (!(event instanceof PointerEvent)) return true
      const target = event.target
      return target instanceof Element && !!target.closest('.vp')
    }

    const adapter = {
      ownerDocument: container.ownerDocument,
      style: container.style,
      setCurrentViewport(vp: ViewportRuntime) {
        viewport = vp
      },
      getBoundingClientRect() {
        return viewport.el.getBoundingClientRect()
      },
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        const wrapped = (event: Event) => {
          if (!controls?.dragging && !isViewportPointerTarget(event)) return
          syncViewportFromEvent(event)
          if (typeof listener === 'function') {
            listener.call(adapter, event)
          } else {
            listener.handleEvent(event)
          }
        }
        listeners.set(listener, wrapped)
        container.addEventListener(type, wrapped, listenerOptions(options))
      },
      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) {
        const wrapped = listeners.get(listener)
        if (!wrapped) return
        container.removeEventListener(type, wrapped, listenerOptions(options))
        listeners.delete(listener)
      },
      setPointerCapture(pointerId: number) {
        viewport.canvas.setPointerCapture(pointerId)
      },
      releasePointerCapture(pointerId: number) {
        if (viewport.canvas.hasPointerCapture(pointerId)) {
          viewport.canvas.releasePointerCapture(pointerId)
        }
      },
    } as TransformDomAdapter

    return adapter
  }

  function syncActiveViewport() {
    if (!controls) return
    prepareViewport(getActiveViewport())
  }

  function syncTransformPivotFromMesh(mesh: Mesh) {
    if (!subObjectPivot) return
    const worldCenter = mesh.localToWorld(meshBoundsCenterLocal(mesh).clone())
    subObjectPivot.position.copy(worldCenter)
    subObjectPivot.quaternion.copy(
      cadState.transformSpace === 'local'
        ? mesh.getWorldQuaternion(new Quaternion())
        : new Quaternion(),
    )
    subObjectPivot.scale.set(1, 1, 1)
    subObjectPivot.updateMatrixWorld(true)
  }

  function syncAttachment() {
    if (!controls) return
    if (controls.dragging) return
    const selected = getSelected()
    const showObject = cadState.editMode === 'object' && cadState.activeTool === 'select' && !!selected?.mesh
    const showSubObject =
      !!selected?.mesh && cadState.editMode !== 'object' && cadState.activeTool === 'select'
    controls.space = cadState.transformSpace

    if (showObject && selected) {
      selected.mesh.updateMatrixWorld(true)
      syncTransformPivotFromMesh(selected.mesh)
      controls.attach(subObjectPivot!)
      controls.mode = cadState.gizmoMode
      controls.enabled = true
    } else if (showSubObject && selected && subObjectPivot) {
      subObjectVertices = selectedVertexIndices(
        selected.mesh,
        cadState.editMode,
        cadState.selVerts,
        cadState.selEdges,
        cadState.selFaces,
      )
      const center = selectionCenterWorld(selected.mesh, subObjectVertices)
      if (!center) {
        controls.detach()
        controls.enabled = false
        return
      }
      selected.mesh.updateMatrixWorld(true)
      subObjectPivot.position.copy(center)
      subObjectPivot.quaternion.copy(
        cadState.transformSpace === 'local'
          ? selected.mesh.getWorldQuaternion(new Quaternion())
          : new Quaternion(),
      )
      subObjectPivot.scale.setScalar(1)
      subObjectPivot.updateMatrixWorld(true)
      controls.attach(subObjectPivot)
      controls.mode = cadState.gizmoMode
      controls.enabled = true
    } else {
      controls.detach()
      controls.enabled = false
    }
  }

  function refreshDragHelpers(selected = getSelected()) {
    if (!selected) return
    if (!isReferenceImage(selected)) addWireEdges(selected.mesh)
    rebuildSubHelpers()
  }

  onMount(() => {
    const vp = getActiveViewport()
    const domAdapter = createDomAdapter(vp.el.parentElement ?? vp.el)
    controls = new TransformControls(vp.camera, domAdapter)
    controls.size = 0.82
    controls.space = 'world'
    subObjectPivot = new Object3D()
    subObjectPivot.name = 'SubObjectTransformPivot'
    currentViewport = vp
    domAdapter.setCurrentViewport(vp)
    scene.add(subObjectPivot)
    scene.add(controls.getHelper())
    applyTransformGizmoColors(controls)
    onReady({ prepareViewport, setVisible: setControlsVisible, isActive: isTransformActive })

    controls.addEventListener('change', () => {
      if (applyingSubObject || applyingObjectTransform || !controls?.dragging) {
        cadState.revision++
        return
      }

      const selected = getSelected()
      if (!selected || !subObjectPivot) {
        cadState.revision++
        return
      }

      if (cadState.editMode === 'object') {
        applyingObjectTransform = true
        if (selected && isReferenceImage(selected)) {
          if (cadState.gizmoMode === 'translate') {
            selected.mesh.position.copy(subObjectPivot.position)
          } else if (cadState.gizmoMode === 'scale') {
            selected.mesh.position.copy(subObjectPivot.position)
            selected.mesh.scale.set(
              dragStartMeshScale.x * subObjectPivot.scale.x,
              dragStartMeshScale.y * subObjectPivot.scale.y,
              dragStartMeshScale.z * subObjectPivot.scale.z,
            )
          }
        } else {
          selected.mesh.matrix.copy(subObjectPivot.matrixWorld).multiply(pivotToMeshOffset)
          selected.mesh.matrix.decompose(
            selected.mesh.position,
            selected.mesh.quaternion,
            selected.mesh.scale,
          )
        }
        selected.mesh.updateMatrixWorld(true)
        if (isReferenceImage(selected)) {
          syncReferenceImageMaterial(selected.mesh, true)
        } else {
          refreshDragHelpers(selected)
        }
        applyingObjectTransform = false
        cadState.revision++
        return
      }

      if (subObjectVertices.size === 0) {
        cadState.revision++
        return
      }

      applyingSubObject = true
      selected.mesh.updateMatrixWorld(true)
      subObjectPivot.updateMatrixWorld(true)
      applyWorldMatrixToVertexSnapshot(
        selected.mesh,
        dragOriginalPositions,
        dragStartPivotWorld,
        subObjectPivot.matrixWorld,
      )
      refreshDragHelpers(selected)
      applyingSubObject = false
    })

    controls.addEventListener('mouseDown', () => {
      dragViewport = currentViewport
      const selected = getSelected()
      dragOriginalPositions = new Map()
      if (selected && subObjectPivot) {
        subObjectPivot.updateMatrixWorld(true)
        if (cadState.editMode === 'object') {
          selected.mesh.updateMatrixWorld(true)
          if (isReferenceImage(selected)) {
            dragStartMeshScale.copy(selected.mesh.scale)
            dragStartMeshPosition.copy(selected.mesh.position)
          } else {
            pivotToMeshOffset.copy(selected.mesh.matrixWorld).premultiply(
              subObjectPivot.matrixWorld.clone().invert(),
            )
          }
        } else {
          subObjectVertices = selectedVertexIndices(
            selected.mesh,
            cadState.editMode,
            cadState.selVerts,
            cadState.selEdges,
            cadState.selFaces,
          )
          const pos = selected.mesh.geometry.attributes.position
          subObjectVertices.forEach((index) => {
            dragOriginalPositions.set(
              index,
              new Vector3(pos.getX(index), pos.getY(index), pos.getZ(index)),
            )
          })
          dragStartPivotWorld.copy(subObjectPivot.matrixWorld)
        }
      }
      onDraggingChange(true)
      if (!historyStarted) {
        beginHistoryAction()
        historyStarted = true
      }
    })

    controls.addEventListener('mouseUp', () => {
      const selected = getSelected()
      if (selected) {
        if (isReferenceImage(selected)) {
          syncReferenceImageMaterial(selected.mesh, true)
          cadState.revision++
        } else {
          refreshObject(selected)
        }
      }
      onDraggingChange(false)
      historyStarted = false
      dragViewport = undefined
      dragOriginalPositions = new Map()
    })

    syncAttachment()

    return () => {
      onReady(null)
      scene.remove(controls!.getHelper())
      if (subObjectPivot) scene.remove(subObjectPivot)
      controls!.dispose()
      controls = undefined
      subObjectPivot = undefined
    }
  })

  $effect(() => {
    cadState.activeViewport
    syncActiveViewport()
  })

  $effect(() => {
    cadState.editMode
    cadState.selectedId
    cadState.activeTool
    cadState.gizmoMode
    cadState.transformSpace
    cadState.revision
    cadState.selVerts
    cadState.selEdges
    cadState.selFaces
    syncAttachment()
    if (controls) {
      controls.mode = cadState.gizmoMode
      controls.translationSnap = cadState.transformSnap ? 0.25 : null
      controls.rotationSnap = cadState.transformSnap ? MathUtils.degToRad(15) : null
      controls.scaleSnap = cadState.transformSnap ? 0.1 : null
    }
  })
</script>
