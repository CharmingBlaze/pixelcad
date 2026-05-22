<script lang="ts">
  import {
    cadState,
    cancelDrawPrimitive,
    cancelDrawPoly,
    cancelBevel,
    cancelExtrude,
    cancelInset,
    cancelSubdivide,
    clearScene,
    deleteSelected,
    duplicateSelected,
    exportObj,
    importMeshFromFile,
    extrudeSelectedFace,
    fillAllHoles,
    fillSelectedEdges,
    flipSelectedFaces,
    getSelected,
    growSubSelection,
    insetSelectedFaces,
    invertFaceSelection,
    loadSceneFromJson,
    mirrorSelected,
    projectSelectedUv,
    saveSceneToFile,
    toggleSelectAll,
    setEditMode,
    setGizmoMode,
    setShading,
    setTool,
    setTransformSnap,
    setTransformSpace,
    startDrawPoly,
    startDrawPrimitive,
    startInteractiveBevel,
    subdivideSelected,
    toggleWireframeGlobal,
  } from '../cad/cadState.svelte'
  import { undo, redo } from '../cad/history.svelte'
  import { getBevelTool } from '../cad/bevelTool'
  import {
    matchShortcut,
    parseAddAction,
    parseGizmoAction,
    parseMirrorAction,
    parseModeAction,
    parsePolyAction,
    parseToolAction,
    parseUvAction,
    parseViewLayoutAction,
  } from '../cad/shortcuts'
  import { applyViewportLayoutMode, toggleViewportMaximize } from '../cad/viewportLayout.svelte'
  import { toggleSidebars } from '../cad/uiLayout.svelte'

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    if (e.key === 'Escape') {
      if (cadState.drawPrimitiveType || cadState.drawPolyMode) {
        e.preventDefault()
        cancelDrawPrimitive()
        cancelDrawPoly()
        return
      }
      if (cadState.activeTool === 'extrudeface') {
        e.preventDefault()
        cancelExtrude()
        return
      }
      if (cadState.activeTool === 'insetface') {
        e.preventDefault()
        cancelInset()
        return
      }
      if (cadState.activeTool === 'subdividetool') {
        e.preventDefault()
        cancelSubdivide()
        return
      }
      if (cadState.activeTool === 'bevel' && getBevelTool()?.active) {
        e.preventDefault()
        cancelBevel()
        return
      }
    }

    const action = matchShortcut(e)
    if (!action) return

    if (action === 'tool:bevel') {
      e.preventDefault()
      if (
        getSelected() &&
        cadState.editMode !== 'object' &&
        (cadState.selEdges.size > 0 ||
          cadState.selVerts.size > 0 ||
          (cadState.editMode === 'face' && cadState.selFaces.size > 0))
      ) {
        startInteractiveBevel()
      } else {
        setTool('bevel')
      }
      return
    }

    if (action === 'ui:toggleSidebars') {
      e.preventDefault()
      toggleSidebars()
      return
    }

    if (action === 'ui:snapToggle') {
      e.preventDefault()
      setTransformSnap(!cadState.transformSnap)
      return
    }

    const mode = parseModeAction(action)
    if (mode) {
      if (mode !== 'object' && !getSelected()) return
      e.preventDefault()
      setEditMode(mode)
      return
    }

    const tool = parseToolAction(action)
    if (tool) {
      e.preventDefault()
      setTool(tool)
      return
    }

    const gizmo = parseGizmoAction(action)
    if (gizmo) {
      if (!getSelected()) return
      e.preventDefault()
      setEditMode('object')
      setTool('select')
      setGizmoMode(gizmo)
      return
    }

    const mirrorAxis = parseMirrorAction(action)
    if (mirrorAxis) {
      if (!getSelected()) return
      e.preventDefault()
      mirrorSelected(mirrorAxis)
      return
    }

    const polyMode = parsePolyAction(action)
    if (polyMode) {
      e.preventDefault()
      startDrawPoly(polyMode)
      return
    }

    const addType = parseAddAction(action)
    if (addType) {
      e.preventDefault()
      startDrawPrimitive(addType)
      return
    }

    const layoutMode = parseViewLayoutAction(action)
    if (layoutMode) {
      e.preventDefault()
      applyViewportLayoutMode(layoutMode, cadState.activeViewport)
      return
    }

    const uvAxis = parseUvAction(action)
    if (uvAxis) {
      if (!getSelected()) return
      e.preventDefault()
      projectSelectedUv(uvAxis)
      return
    }

    switch (action) {
      case 'delete':
        e.preventDefault()
        deleteSelected()
        break
      case 'duplicate':
        e.preventDefault()
        duplicateSelected()
        break
      case 'selectToggleAll':
        e.preventDefault()
        toggleSelectAll()
        break
      case 'selectGrow':
        e.preventDefault()
        growSubSelection()
        break
      case 'selectInvert':
        e.preventDefault()
        invertFaceSelection()
        break
      case 'mesh:extrude':
        e.preventDefault()
        extrudeSelectedFace()
        break
      case 'mesh:inset':
        e.preventDefault()
        insetSelectedFaces()
        break
      case 'mesh:flip':
        e.preventDefault()
        flipSelectedFaces()
        break
      case 'mesh:fill':
        e.preventDefault()
        fillSelectedEdges()
        break
      case 'mesh:fillHoles':
        e.preventDefault()
        fillAllHoles()
        break
      case 'mesh:subdivide':
        e.preventDefault()
        subdivideSelected()
        break
      case 'newScene':
        e.preventDefault()
        if (confirm('Clear the current scene?')) clearScene()
        break
      case 'save':
        e.preventDefault()
        saveSceneToFile()
        break
      case 'open':
        e.preventDefault()
        loadSceneFromJson()
        break
      case 'import':
        e.preventDefault()
        void importMeshFromFile()
        break
      case 'export:obj':
        e.preventDefault()
        exportObj()
        break
      case 'shading:solid':
        e.preventDefault()
        setShading('solid')
        break
      case 'shading:wire':
        e.preventDefault()
        setShading(cadState.shadingMode === 'wire' ? 'solid' : 'wire')
        break
      case 'view:outlines':
        e.preventDefault()
        toggleWireframeGlobal()
        break
      case 'view:normals':
        e.preventDefault()
        setShading(cadState.shadingMode === 'matcap' ? 'solid' : 'matcap')
        break
      case 'viewport:maximize':
        e.preventDefault()
        toggleViewportMaximize()
        break
      case 'space:toggle':
        e.preventDefault()
        setTransformSpace(cadState.transformSpace === 'world' ? 'local' : 'world')
        break
      case 'undo':
        e.preventDefault()
        undo()
        break
      case 'redo':
        e.preventDefault()
        redo()
        break
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />
