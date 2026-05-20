<script lang="ts">
  import {
    clearScene,
    deleteSelected,
    deselectAllSub,
    duplicateSelected,
    exportObj,
    exportScene,
    extrudeSelectedFace,
    fillAllHoles,
    fillSelectedEdges,
    flipSelectedFaces,
    getSelected,
    growSubSelection,
    importMeshFromFile,
    insetSelectedFaces,
    invertFaceSelection,
    loadSceneFromJson,
    mirrorSelected,
    projectSelectedUv,
    saveSceneToFile,
    selectAllSub,
    setShading,
    setFaceSide,
    setSolidSeeThrough,
    startDrawPrimitive,
    startDrawPoly,
    setPolyDrawSpace,
    setPolyDrawSurface,
    subdivideSelected,
    toggleWireframeGlobal,
    cadState,
  } from '../cad/cadState.svelte'
  import { historyState, redo, undo } from '../cad/history.svelte'
  import { shortcutHint, shortcutLabel, shortcutLabelsAll } from '../cad/shortcuts'
  import type { PolyDrawMode, PrimitiveType } from '../cad/types'
  import {
    setViewportLayoutMode,
    toggleViewportMaximize,
    viewportLayout,
    type ViewportLayoutMode,
  } from '../cad/viewportLayout.svelte'

  let openMenu = $state<string | null>(null)
  const hasSelection = $derived(!!getSelected())
  const hasFaceSelection = $derived(cadState.editMode === 'face' && cadState.selFaces.size > 0)
  const hasEdgeSelection = $derived(cadState.editMode === 'edge' && cadState.selEdges.size >= 3)
  const canEditMesh = $derived(cadState.editMode !== 'object' && hasSelection)

  const primitives: { type: PrimitiveType; label: string; action: string }[] = [
    { type: 'box', label: 'Box', action: 'add:box' },
    { type: 'sphere', label: 'UV Sphere (low)', action: 'add:sphere' },
    { type: 'cylinder', label: 'Cylinder', action: 'add:cylinder' },
    { type: 'cone', label: 'Cone', action: 'add:cone' },
    { type: 'pyramid', label: 'Pyramid', action: 'add:pyramid' },
    { type: 'torus', label: 'Torus (low)', action: 'add:torus' },
    { type: 'plane', label: 'Plane', action: 'add:plane' },
  ]

  const polyModes: { mode: PolyDrawMode; label: string; action: string }[] = [
    { mode: 'triangle', label: 'Triangle Draw', action: 'poly:triangle' },
    { mode: 'quad', label: 'Quad Draw', action: 'poly:quad' },
    { mode: 'poly', label: 'Poly Draw', action: 'poly:poly' },
  ]

  function toggleMenu(id: string) {
    openMenu = openMenu === id ? null : id
  }

  function closeMenus() {
    openMenu = null
  }

  function pickAdd(type: PrimitiveType) {
    startDrawPrimitive(type)
    closeMenus()
  }

  function pickPoly(mode: PolyDrawMode) {
    startDrawPoly(mode)
    closeMenus()
  }

  function pickLayout(mode: ViewportLayoutMode) {
    setViewportLayoutMode(mode)
    closeMenus()
  }

  function openUvEditor() {
    setViewportLayoutMode('uvEditor')
    closeMenus()
  }

  function sc(action: string) {
    return shortcutLabel(action)
  }

  function scAll(action: string) {
    return shortcutLabelsAll(action)
  }
</script>

<svelte:window onclick={closeMenus} />

<nav class="menubar">
  <div class="menu-item" class:open={openMenu === 'file'}>
    <button type="button" title="File menu" onclick={(e) => { e.stopPropagation(); toggleMenu('file') }}>File</button>
    {#if openMenu === 'file'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        <button type="button" class="dd-item" title={shortcutHint('New Scene', 'newScene')} onclick={() => { clearScene(); closeMenus() }}>
          New Scene {#if sc('newScene')}<span>{sc('newScene')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" title={shortcutHint('Open', 'open')} onclick={() => { loadSceneFromJson(); closeMenus() }}>
          Open... {#if sc('open')}<span>{sc('open')}</span>{/if}
        </button>
        <button type="button" class="dd-item" title={shortcutHint('Save', 'save')} onclick={() => { saveSceneToFile(); closeMenus() }}>
          Save... {#if sc('save')}<span>{sc('save')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" title={shortcutHint('Import Mesh', 'import')} onclick={() => { void importMeshFromFile(); closeMenus() }}>
          Import... {#if sc('import')}<span>{sc('import')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" title={shortcutHint('Export OBJ', 'export:obj')} onclick={() => { exportScene('obj'); closeMenus() }}>
          Export OBJ {#if sc('export:obj')}<span>{sc('export:obj')}</span>{/if}
        </button>
        <button type="button" class="dd-item" onclick={() => { exportScene('gltf'); closeMenus() }}>
          Export GLTF
        </button>
        <button type="button" class="dd-item" onclick={() => { exportScene('glb'); closeMenus() }}>
          Export GLB
        </button>
        <button type="button" class="dd-item" onclick={() => { exportScene('stl'); closeMenus() }}>
          Export STL
        </button>
        <button type="button" class="dd-item" onclick={() => { exportScene('ply'); closeMenus() }}>
          Export PLY
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'add'}>
    <button type="button" title="Add primitives" onclick={(e) => { e.stopPropagation(); toggleMenu('add') }}>Add</button>
    {#if openMenu === 'add'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        {#each primitives as p}
          <button type="button" class="dd-item" title={shortcutHint(p.label, p.action)} onclick={() => pickAdd(p.type)}>
            {p.label} {#if scAll(p.action)}<span>{scAll(p.action)}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'poly'}>
    <button type="button" title="Polygon drawing tools" onclick={(e) => { e.stopPropagation(); toggleMenu('poly') }}>Poly</button>
    {#if openMenu === 'poly'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        {#each polyModes as p}
          <button type="button" class="dd-item" title={shortcutHint(p.label, p.action)} onclick={() => pickPoly(p.mode)}>
            {p.label} {#if scAll(p.action)}<span>{scAll(p.action)}</span>{/if}
          </button>
        {/each}
        <div class="dd-sep"></div>
        <button
          type="button"
          class="dd-item"
          class:active={cadState.polyDrawSpace === '2d'}
          onclick={() => { setPolyDrawSpace('2d'); closeMenus() }}
        >
          2D Grid Draw
        </button>
        <button
          type="button"
          class="dd-item"
          class:active={cadState.polyDrawSpace === '3d'}
          onclick={() => { setPolyDrawSpace('3d'); closeMenus() }}
        >
          3D Space Draw
        </button>
        <button
          type="button"
          class="dd-item"
          class:active={cadState.polyDrawSurface}
          onclick={() => { setPolyDrawSurface(!cadState.polyDrawSurface); closeMenus() }}
        >
          Draw On Surface {cadState.polyDrawSurface ? '(On)' : '(Off)'}
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'edit'}>
    <button type="button" title="Edit operations" onclick={(e) => { e.stopPropagation(); toggleMenu('edit') }}>Edit</button>
    {#if openMenu === 'edit'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        <button type="button" class="dd-item" disabled={!historyState.canUndo} title={shortcutHint('Undo', 'undo')} onclick={() => { undo(); closeMenus() }}>
          Undo {#if sc('undo')}<span>{sc('undo')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!historyState.canRedo} title={shortcutHint('Redo', 'redo')} onclick={() => { redo(); closeMenus() }}>
          Redo {#if sc('redo')}<span>{sc('redo')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Duplicate', 'duplicate')} onclick={() => { duplicateSelected(); closeMenus() }}>
          Duplicate {#if sc('duplicate')}<span>{sc('duplicate')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Delete', 'delete')} onclick={() => { deleteSelected(); closeMenus() }}>
          Delete {#if sc('delete')}<span>{sc('delete')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Subdivide', 'mesh:subdivide')} onclick={() => { subdivideSelected(); closeMenus() }}>
          Subdivide {#if sc('mesh:subdivide')}<span>{sc('mesh:subdivide')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasFaceSelection} title={shortcutHint('Extrude Faces', 'mesh:extrude')} onclick={() => { extrudeSelectedFace(); closeMenus() }}>
          Extrude Faces {#if sc('mesh:extrude')}<span>{sc('mesh:extrude')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasFaceSelection} title={shortcutHint('Inset Faces', 'mesh:inset')} onclick={() => { insetSelectedFaces(); closeMenus() }}>
          Inset Faces {#if sc('mesh:inset')}<span>{sc('mesh:inset')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasFaceSelection} title={shortcutHint('Flip Faces', 'mesh:flip')} onclick={() => { flipSelectedFaces(); closeMenus() }}>
          Flip Faces {#if sc('mesh:flip')}<span>{sc('mesh:flip')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasEdgeSelection} title={shortcutHint('Fill Edge Loop', 'mesh:fill')} onclick={() => { fillSelectedEdges(); closeMenus() }}>
          Fill {#if sc('mesh:fill')}<span>{sc('mesh:fill')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Fill Holes', 'mesh:fillHoles')} onclick={() => { fillAllHoles(); closeMenus() }}>
          Fill Holes {#if sc('mesh:fillHoles')}<span>{sc('mesh:fillHoles')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Mirror X', 'mesh:mirrorX')} onclick={() => { mirrorSelected('x'); closeMenus() }}>
          Mirror X {#if sc('mesh:mirrorX')}<span>{sc('mesh:mirrorX')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Mirror Y', 'mesh:mirrorY')} onclick={() => { mirrorSelected('y'); closeMenus() }}>
          Mirror Y {#if sc('mesh:mirrorY')}<span>{sc('mesh:mirrorY')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Mirror Z', 'mesh:mirrorZ')} onclick={() => { mirrorSelected('z'); closeMenus() }}>
          Mirror Z {#if sc('mesh:mirrorZ')}<span>{sc('mesh:mirrorZ')}</span>{/if}
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'select'}>
    <button type="button" title="Selection tools" onclick={(e) => { e.stopPropagation(); toggleMenu('select') }}>Select</button>
    {#if openMenu === 'select'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        <button type="button" class="dd-item" disabled={!canEditMesh} title={shortcutHint('Select All', 'selectAll')} onclick={() => { selectAllSub(); closeMenus() }}>
          Select All {#if sc('selectAll')}<span>{sc('selectAll')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!canEditMesh} title={shortcutHint('Grow Selection', 'selectGrow')} onclick={() => { growSubSelection(); closeMenus() }}>
          Grow Selection {#if sc('selectGrow')}<span>{sc('selectGrow')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!canEditMesh} title={shortcutHint('Deselect All', 'deselectAll')} onclick={() => { deselectAllSub(); closeMenus() }}>
          Deselect All {#if sc('deselectAll')}<span>{sc('deselectAll')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={cadState.editMode !== 'face' || !hasSelection} title={shortcutHint('Invert Selection', 'selectInvert')} onclick={() => { invertFaceSelection(); closeMenus() }}>
          Invert Selection {#if sc('selectInvert')}<span>{sc('selectInvert')}</span>{/if}
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'view'}>
    <button type="button" title="Viewport and display" onclick={(e) => { e.stopPropagation(); toggleMenu('view') }}>View</button>
    {#if openMenu === 'view'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        <button type="button" class="dd-item" class:checked={viewportLayout.mode === 'quad'} title={shortcutHint('Quad View', 'view:quad')} onclick={() => pickLayout('quad')}>
          Quad View {#if sc('view:quad')}<span>{sc('view:quad')}</span>{/if}
        </button>
        <button type="button" class="dd-item" class:checked={viewportLayout.mode === 'single'} title={shortcutHint('Maximize View', 'viewport:maximize')} onclick={() => { toggleViewportMaximize(); closeMenus() }}>
          Maximize View {#if sc('viewport:maximize')}<span>{sc('viewport:maximize')}</span>{/if}
        </button>
        <button type="button" class="dd-item" class:checked={viewportLayout.mode === 'splitVertical'} title={shortcutHint('Vertical Split', 'view:splitVertical')} onclick={() => pickLayout('splitVertical')}>
          Vertical Split {#if sc('view:splitVertical')}<span>{sc('view:splitVertical')}</span>{/if}
        </button>
        <button type="button" class="dd-item" class:checked={viewportLayout.mode === 'splitHorizontal'} title={shortcutHint('Horizontal Split', 'view:splitHorizontal')} onclick={() => pickLayout('splitHorizontal')}>
          Horizontal Split {#if sc('view:splitHorizontal')}<span>{sc('view:splitHorizontal')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" title={shortcutHint('Solid Shading', 'shading:solid')} onclick={() => { setShading('solid'); closeMenus() }}>
          Solid Shading {#if sc('shading:solid')}<span>{sc('shading:solid')}</span>{/if}
        </button>
        <button type="button" class="dd-item" title={shortcutHint('Toggle Outlines', 'view:outlines')} onclick={() => { toggleWireframeGlobal(); closeMenus() }}>
          Toggle Outlines {#if sc('view:outlines')}<span>{sc('view:outlines')}</span>{/if}
        </button>
        <button
          type="button"
          class="dd-item"
          title={shortcutHint('Toggle Normals', 'view:normals')}
          onclick={() => {
            setShading(cadState.shadingMode === 'matcap' ? 'solid' : 'matcap')
            closeMenus()
          }}
        >
          Toggle Normals {#if sc('view:normals')}<span>{sc('view:normals')}</span>{/if}
        </button>
        <div class="dd-sep"></div>
        <button type="button" class="dd-item" class:checked={cadState.faceSide === 'front'} onclick={() => { setFaceSide('front'); closeMenus() }}>
          Front Faces
        </button>
        <button type="button" class="dd-item" class:checked={cadState.faceSide === 'back'} onclick={() => { setFaceSide('back'); closeMenus() }}>
          Back Faces
        </button>
        <button type="button" class="dd-item" class:checked={cadState.faceSide === 'double'} onclick={() => { setFaceSide('double'); closeMenus() }}>
          Double-Sided
        </button>
        <button type="button" class="dd-item" class:checked={cadState.solidSeeThrough} onclick={() => { setSolidSeeThrough(!cadState.solidSeeThrough); closeMenus() }}>
          See Through Solids
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" class:open={openMenu === 'uv'}>
    <button type="button" title="UV projection" onclick={(e) => { e.stopPropagation(); toggleMenu('uv') }}>UV</button>
    {#if openMenu === 'uv'}
      <div class="dropdown" role="menu" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Project X', 'uv:projectX')} onclick={() => { projectSelectedUv('x'); closeMenus() }}>
          Project X {#if sc('uv:projectX')}<span>{sc('uv:projectX')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Project Y', 'uv:projectY')} onclick={() => { projectSelectedUv('y'); closeMenus() }}>
          Project Y {#if sc('uv:projectY')}<span>{sc('uv:projectY')}</span>{/if}
        </button>
        <button type="button" class="dd-item" disabled={!hasSelection} title={shortcutHint('Project Z', 'uv:projectZ')} onclick={() => { projectSelectedUv('z'); closeMenus() }}>
          Project Z {#if sc('uv:projectZ')}<span>{sc('uv:projectZ')}</span>{/if}
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item">
    <button type="button" title="Open UV Editor" onclick={openUvEditor}>UV Editor</button>
  </div>
</nav>

<style>
  .menubar {
    display: flex;
    align-items: stretch;
    background: #2a2a2a;
    border-bottom: 1px solid #111;
    height: 28px;
    flex-shrink: 0;
    z-index: 100;
  }

  .menu-item {
    position: relative;
  }

  .menu-item button:first-child {
    padding: 0 12px;
    height: 28px;
    border: none;
    background: transparent;
    color: #d8dee7;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .menu-item.open button:first-child,
  .menu-item button:first-child:hover {
    background: #3a3a3a;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: #2d2d2d;
    border: 1px solid #111;
    min-width: 220px;
    z-index: 999;
    box-shadow: 0 4px 12px #0008;
    display: flex;
    flex-direction: column;
  }

  .dd-item {
    padding: 5px 16px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    color: #d8dee7;
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .dd-item:hover:not(:disabled) {
    background: #3a3a3a;
    color: #fff;
  }

  .dd-item.checked {
    color: #8dc6ff;
  }

  .dd-item:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .dd-item span {
    opacity: 0.5;
    font-size: 11px;
    flex-shrink: 0;
  }

  .dd-sep {
    height: 1px;
    background: #111;
    margin: 3px 0;
  }
</style>
