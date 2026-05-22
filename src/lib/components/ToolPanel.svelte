<script lang="ts">
  import {
    cadState,
    deleteSelected,
    duplicateSelected,
    extrudeSelectedFace,
    fillAllHoles,
    fillSelectedEdges,
    flipSelectedFaces,
    getSelected,
    growSubSelection,
    insetSelectedFaces,
    mirrorSelected,
    setEditMode,
    setGizmoMode,
    setShading,
    setFaceSide,
    setSolidSeeThrough,
    setTool,
    setTransformSnap,
    setTransformSpace,
    startDrawPoly,
    setPolyDrawSpace,
    setPolyDrawSurface,
    setPolyDrawContinuous,
    startInteractiveBevel,
    subdivideSelected,
  } from '../cad/cadState.svelte'
  import { historyState, redo, undo } from '../cad/history.svelte'
  import { shortcutHint } from '../cad/shortcuts'
  import type { ActiveTool, FaceSideMode, GizmoMode, PolyDrawMode, ShadingMode } from '../cad/types'

  const hasSelection = $derived(!!getSelected())
  const showGizmoTools = $derived(hasSelection)
  const hasFaceSelection = $derived(cadState.editMode === 'face' && cadState.selFaces.size > 0)
  const hasEdgeSelection = $derived(cadState.editMode === 'edge' && cadState.selEdges.size >= 3)
  const canEditMesh = $derived(cadState.editMode !== 'object' && hasSelection)

  const tools: { id: ActiveTool; label: string; action: string }[] = [
    { id: 'select', label: 'Select', action: 'tool:select' },
    { id: 'grab', label: 'Grab', action: 'tool:grab' },
    { id: 'bevel', label: 'Bevel', action: 'tool:bevel' },
  ]

  const gizmos: { id: GizmoMode; label: string; action: string }[] = [
    { id: 'translate', label: 'Move', action: 'gizmo:translate' },
    { id: 'rotate', label: 'Rotate', action: 'gizmo:rotate' },
    { id: 'scale', label: 'Scale', action: 'gizmo:scale' },
  ]

  const shadingModes: { id: ShadingMode; label: string; action: string }[] = [
    { id: 'solid', label: 'Solid', action: 'shading:solid' },
    { id: 'wire', label: 'Wire', action: 'shading:wire' },
    { id: 'matcap', label: 'MatCap', action: 'view:normals' },
  ]

  const faceSideModes: { id: FaceSideMode; label: string }[] = [
    { id: 'front', label: 'Front' },
    { id: 'back', label: 'Back' },
    { id: 'double', label: '2-Side' },
  ]

  const modes: { id: 'object' | 'vertex' | 'edge' | 'face'; label: string; action: string }[] = [
    { id: 'object', label: 'Object', action: 'mode:object' },
    { id: 'vertex', label: 'Vertex', action: 'mode:vertex' },
    { id: 'edge', label: 'Edge', action: 'mode:edge' },
    { id: 'face', label: 'Face', action: 'mode:face' },
  ]

  const polyTools: { mode: PolyDrawMode; label: string; action: string; hint: string }[] = [
    { mode: 'triangle', label: 'Tri', action: 'poly:triangle', hint: 'Triangle Draw' },
    { mode: 'quad', label: 'Quad', action: 'poly:quad', hint: 'Quad Draw' },
    { mode: 'poly', label: 'Poly', action: 'poly:poly', hint: 'Poly Draw' },
  ]

  function pickGizmo(mode: GizmoMode) {
    setGizmoMode(mode)
    setTool('select')
  }

  function pickBevel() {
    if (
      hasSelection &&
      cadState.editMode !== 'object' &&
      (cadState.selEdges.size > 0 ||
        cadState.selVerts.size > 0 ||
        (cadState.editMode === 'face' && cadState.selFaces.size > 0))
    ) {
      startInteractiveBevel()
    } else {
      setTool('bevel')
    }
  }
</script>

<aside class="tool-panel">
  <header class="panel-header">Tools</header>

  <div class="panel-body">
    <section class="section">
      <h3 class="section-label">History</h3>
      <div class="btn-grid cols-3">
        <button type="button" class="tp-btn" disabled={!historyState.canUndo} title={shortcutHint('Undo', 'undo')} onclick={() => undo()}>Undo</button>
        <button type="button" class="tp-btn" disabled={!historyState.canRedo} title={shortcutHint('Redo', 'redo')} onclick={() => redo()}>Redo</button>
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Duplicate', 'duplicate')} onclick={() => duplicateSelected()}>Dup</button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-label">Edit Mode</h3>
      <div class="btn-grid cols-2">
        {#each modes as m}
          <button
            type="button"
            class="tp-btn"
            class:active={cadState.editMode === m.id}
            disabled={m.id !== 'object' && !hasSelection}
            title={shortcutHint(m.label, m.action)}
            onclick={() => setEditMode(m.id)}
          >
            {m.label}
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <h3 class="section-label">Tool</h3>
      <div class="btn-grid cols-3">
        {#each tools as t}
          <button
            type="button"
            class="tp-btn"
            class:active={cadState.activeTool === t.id}
            title={shortcutHint(t.label, t.action)}
            onclick={() => (t.id === 'bevel' ? pickBevel() : setTool(t.id))}
          >
            {t.label}
          </button>
        {/each}
      </div>
      <label class="tp-check" title={shortcutHint('Snap', 'ui:snapToggle')}>
        <input type="checkbox" checked={cadState.transformSnap} onchange={(e) => setTransformSnap(e.currentTarget.checked)} />
        Snap
      </label>
    </section>

    <section class="section">
      <h3 class="section-label">Transform</h3>
      <div class="btn-grid cols-3">
        {#each gizmos as g}
          <button type="button" class="tp-btn" class:active={cadState.gizmoMode === g.id} disabled={!showGizmoTools} title={shortcutHint(g.label, g.action)} onclick={() => pickGizmo(g.id)}>
            {g.label}
          </button>
        {/each}
      </div>
      <div class="btn-grid cols-2">
        <button type="button" class="tp-btn" class:active={cadState.transformSpace === 'world'} title={shortcutHint('World space', 'space:toggle')} onclick={() => setTransformSpace('world')}>World</button>
        <button type="button" class="tp-btn" class:active={cadState.transformSpace === 'local'} title={shortcutHint('Local space', 'space:toggle')} onclick={() => setTransformSpace('local')}>Local</button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-label">Poly Draw</h3>
      <div class="btn-grid cols-2">
        <button
          type="button"
          class="tp-btn"
          class:active={cadState.polyDrawSpace === '2d'}
          title="Draw on the ground grid"
          onclick={() => setPolyDrawSpace('2d')}
        >
          2D
        </button>
        <button
          type="button"
          class="tp-btn"
          class:active={cadState.polyDrawSpace === '3d'}
          title="Draw in 3D space"
          onclick={() => setPolyDrawSpace('3d')}
        >
          3D
        </button>
      </div>
      <label class="tp-check" title="Place points on mesh surfaces when clicking geometry">
        <input
          type="checkbox"
          checked={cadState.polyDrawSurface}
          onchange={(e) => setPolyDrawSurface(e.currentTarget.checked)}
        />
        Surface
      </label>
      <label class="tp-check" title="Keep drawing into the same mesh after each shape; press Esc to exit">
        <input
          type="checkbox"
          checked={cadState.polyDrawContinuous}
          onchange={(e) => setPolyDrawContinuous(e.currentTarget.checked)}
        />
        Continuous
      </label>
      <div class="btn-grid cols-1 poly-tools">
        {#each polyTools as p}
          <button
            type="button"
            class="tp-btn"
            class:active={cadState.activeTool === 'drawpoly' && cadState.drawPolyMode === p.mode}
            title={shortcutHint(p.hint, p.action)}
            onclick={() => startDrawPoly(p.mode)}
          >
            {p.label}
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <h3 class="section-label">Mesh</h3>
      <div class="btn-grid cols-2">
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Subdivide', 'mesh:subdivide')} onclick={() => subdivideSelected()}>SubD</button>
        <button type="button" class="tp-btn" disabled={!canEditMesh} title={shortcutHint('Grow', 'selectGrow')} onclick={() => growSubSelection()}>Grow</button>
        <button type="button" class="tp-btn" disabled={!hasFaceSelection} title={shortcutHint('Extrude', 'mesh:extrude')} onclick={() => extrudeSelectedFace()}>Ext</button>
        <button type="button" class="tp-btn" disabled={!hasFaceSelection} title={shortcutHint('Inset', 'mesh:inset')} onclick={() => insetSelectedFaces()}>Ins</button>
        <button type="button" class="tp-btn" disabled={!hasFaceSelection} title={shortcutHint('Flip', 'mesh:flip')} onclick={() => flipSelectedFaces()}>Flip</button>
        <button type="button" class="tp-btn" disabled={!hasEdgeSelection} title={shortcutHint('Fill', 'mesh:fill')} onclick={() => fillSelectedEdges()}>Fill</button>
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Fill Holes', 'mesh:fillHoles')} onclick={() => fillAllHoles()}>Holes</button>
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Mirror X', 'mesh:mirrorX')} onclick={() => mirrorSelected('x')}>Mir X</button>
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Mirror Y', 'mesh:mirrorY')} onclick={() => mirrorSelected('y')}>Mir Y</button>
        <button type="button" class="tp-btn" disabled={!hasSelection} title={shortcutHint('Mirror Z', 'mesh:mirrorZ')} onclick={() => mirrorSelected('z')}>Mir Z</button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-label">Shading</h3>
      <div class="btn-grid cols-3">
        {#each shadingModes as s}
          <button type="button" class="tp-btn" class:active={cadState.shadingMode === s.id} title={shortcutHint(s.label, s.action)} onclick={() => setShading(s.id)}>
            {s.label}
          </button>
        {/each}
      </div>
      <div class="btn-grid cols-3 face-side">
        {#each faceSideModes as side}
          <button
            type="button"
            class="tp-btn"
            class:active={cadState.faceSide === side.id}
            title="{side.label} faces"
            onclick={() => setFaceSide(side.id)}
          >
            {side.label}
          </button>
        {/each}
      </div>
      <label class="tp-check" title="Draw solid meshes semi-transparent so geometry behind stays visible">
        <input
          type="checkbox"
          checked={cadState.solidSeeThrough}
          onchange={(e) => setSolidSeeThrough(e.currentTarget.checked)}
        />
        See Through
      </label>
    </section>

    <section class="section">
      <button type="button" class="tp-btn tp-btn-warn full" disabled={!hasSelection} title={shortcutHint('Delete', 'delete')} onclick={() => deleteSelected()}>Del</button>
    </section>
  </div>
</aside>

<style>
  .tool-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #232528;
    overflow: hidden;
  }

  .panel-header {
    flex-shrink: 0;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 650;
    color: #b7c2d0;
    text-transform: uppercase;
    border-bottom: 1px solid #111;
    background: #292b2e;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    padding: 8px 8px 12px;
  }

  .section {
    margin-bottom: 14px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    margin: 0 0 6px;
    font-size: 9px;
    font-weight: 600;
    color: #8a95a3;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .btn-grid {
    display: grid;
    gap: 5px;
  }

  .btn-grid + .btn-grid {
    margin-top: 5px;
  }

  .btn-grid.poly-tools {
    margin-top: 5px;
  }

  .btn-grid.face-side {
    margin-top: 5px;
  }

  .btn-grid.cols-1 {
    grid-template-columns: 1fr;
  }

  .btn-grid.cols-2 {
    grid-template-columns: 1fr 1fr;
  }

  .btn-grid.cols-3 {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .tp-btn {
    box-sizing: border-box;
    min-height: 24px;
    padding: 4px 6px;
    border: 1px solid #333;
    border-radius: 2px;
    background: #2a2a2a;
    color: #c4ccd7;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tp-btn.full {
    width: 100%;
  }

  .tp-btn:hover:not(:disabled) {
    background: #333;
    color: #eef5ff;
  }

  .tp-btn.active {
    background: #1a4a8a;
    border-color: #3a7adc;
    color: #eaf4ff;
  }

  .tp-btn-warn {
    border-color: #6a3a3a;
    color: #e87070;
  }

  .tp-btn-warn:hover:not(:disabled) {
    background: #3a2020;
  }

  .tp-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .tp-check {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    font-size: 10px;
    color: #aeb8c4;
    cursor: pointer;
  }

  .tp-check input {
    width: 12px;
    height: 12px;
    margin: 0;
  }
</style>
