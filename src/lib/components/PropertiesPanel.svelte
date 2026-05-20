<script lang="ts">
  import { beginHistoryAction } from '../cad/history.svelte'
  import { cadState, getSelected, renameSelected, updateSelectedTransform } from '../cad/cadState.svelte'
  import MaterialEditorPanel from './MaterialEditorPanel.svelte'

  type InspectorTab = 'properties' | 'materials'

  const sel = $derived(getSelected())
  const showObject = $derived(!!sel && cadState.editMode === 'object')

  let activeTab = $state<InspectorTab>('properties')
  let pos = $state({ x: 0, y: 0, z: 0 })
  let rot = $state({ x: 0, y: 0, z: 0 })
  let scl = $state({ x: 1, y: 1, z: 1 })
  let objectName = $state('')
  let historyStarted = false

  $effect(() => {
    cadState.revision
    const o = getSelected()
    if (!o) return
    objectName = o.name
    pos = {
      x: round(o.mesh.position.x),
      y: round(o.mesh.position.y),
      z: round(o.mesh.position.z),
    }
    rot = {
      x: round(radToDeg(o.mesh.rotation.x)),
      y: round(radToDeg(o.mesh.rotation.y)),
      z: round(radToDeg(o.mesh.rotation.z)),
    }
    scl = {
      x: round(o.mesh.scale.x),
      y: round(o.mesh.scale.y),
      z: round(o.mesh.scale.z),
    }
    historyStarted = false
  })

  function round(n: number) {
    return Math.round(n * 1000) / 1000
  }

  function radToDeg(r: number) {
    return (r * 180) / Math.PI
  }

  function degToRad(d: number) {
    return (d * Math.PI) / 180
  }

  function onFocus() {
    historyStarted = false
  }

  function commitField() {
    if (!sel) return
    if (!historyStarted) {
      beginHistoryAction()
      historyStarted = true
    }
    updateSelectedTransform({
      position: [pos.x, pos.y, pos.z],
      rotation: [degToRad(rot.x), degToRad(rot.y), degToRad(rot.z)],
      scale: [scl.x, scl.y, scl.z],
    })
  }

  function commitName() {
    renameSelected(objectName)
  }
</script>

<aside class="panel">
  <header class="panel-header">
    <div class="tab-bar" role="tablist" aria-label="Inspector">
      <button
        type="button"
        role="tab"
        class="tab"
        class:active={activeTab === 'properties'}
        aria-selected={activeTab === 'properties'}
        onclick={() => (activeTab = 'properties')}
      >
        Properties
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        class:active={activeTab === 'materials'}
        aria-selected={activeTab === 'materials'}
        onclick={() => (activeTab = 'materials')}
      >
        Materials
      </button>
    </div>
  </header>

  {#if activeTab === 'properties'}
    {#if showObject && sel}
      <div class="panel-body" role="tabpanel">
        <div class="field readonly">
          <span class="label">Name</span>
          <input class="inline-input" bind:value={objectName} onblur={commitName} />
        </div>
        <div class="field readonly">
          <span class="label">Type</span>
          <span class="value">{sel.type}</span>
        </div>
        <div class="field readonly">
          <span class="label">Node</span>
          <span class="value">{sel.node.kind} / {sel.node.visible ? 'visible' : 'hidden'}</span>
        </div>

        <div class="section">Scene Graph</div>
        <div class="field readonly">
          <span class="label">Parent</span>
          <span class="value">{sel.node.parentId ?? 'Scene'}</span>
        </div>
        <div class="field readonly">
          <span class="label">Children</span>
          <span class="value">{sel.node.children.length}</span>
        </div>

        <div class="section">Geometry</div>
        <div class="stats">
          <span>{sel.stats.vertices}<small>Verts</small></span>
          <span>{sel.stats.edges}<small>Edges</small></span>
          <span>{sel.stats.faces}<small>Faces</small></span>
        </div>

        <div class="section">UV Channels</div>
        {#each sel.uvChannels as uv}
          <div class="field readonly">
            <span class="label">{uv.name}</span>
            <span class="value">{uv.active ? 'active' : 'stored'}</span>
          </div>
        {/each}

        <div class="section">Position</div>
        <div class="vec3">
          {#each ['x', 'y', 'z'] as axis}
            <label class="axis-field">
              <span>{axis.toUpperCase()}</span>
              <input
                type="number"
                step="0.1"
                bind:value={pos[axis as 'x' | 'y' | 'z']}
                onfocus={onFocus}
                onchange={commitField}
              />
            </label>
          {/each}
        </div>

        <div class="section">Rotation deg</div>
        <div class="vec3">
          {#each ['x', 'y', 'z'] as axis}
            <label class="axis-field">
              <span>{axis.toUpperCase()}</span>
              <input
                type="number"
                step="1"
                bind:value={rot[axis as 'x' | 'y' | 'z']}
                onfocus={onFocus}
                onchange={commitField}
              />
            </label>
          {/each}
        </div>

        <div class="section">Scale</div>
        <div class="vec3">
          {#each ['x', 'y', 'z'] as axis}
            <label class="axis-field">
              <span>{axis.toUpperCase()}</span>
              <input
                type="number"
                step="0.1"
                min="0.01"
                bind:value={scl[axis as 'x' | 'y' | 'z']}
                onfocus={onFocus}
                onchange={commitField}
              />
            </label>
          {/each}
        </div>
      </div>
    {:else}
      <p class="empty">Select an object in Object mode to edit transforms.</p>
    {/if}
  {:else}
    <div class="panel-body" role="tabpanel">
      <MaterialEditorPanel />
    </div>
  {/if}
</aside>

<style>
  .panel {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: #252525;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    padding: 0;
    border-bottom: 1px solid #111;
    background: #2a2a2a;
  }

  .tab-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .tab {
    padding: 7px 8px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #8f9aa8;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    cursor: pointer;
  }

  .tab:hover {
    color: #c5ced9;
    background: #2f3236;
  }

  .tab.active {
    color: #d8dee7;
    border-bottom-color: #3a7adc;
    background: #252525;
  }

  .panel-body {
    padding: 8px;
    overflow-y: auto;
    overflow-x: auto;
    flex: 1;
    min-height: 0;
  }

  .empty {
    padding: 12px 10px;
    font-size: 12px;
    color: #8f9aa8;
    line-height: 1.4;
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 12px;
    gap: 8px;
  }

  .field .label {
    color: #9aa4b2;
  }

  .field .value {
    color: #d8dee7;
    font-family: 'Cascadia Mono', Consolas, monospace;
    text-align: right;
  }

  .inline-input {
    min-width: 0;
    width: 112px;
    padding: 3px 4px;
    font-size: 12px;
    font-family: 'Cascadia Mono', Consolas, monospace;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 2px;
    color: #d8dee7;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .stats span {
    border: 1px solid #333;
    background: #1a1a1a;
    padding: 5px 3px;
    border-radius: 2px;
    color: #d8dee7;
    text-align: center;
    font-family: 'Cascadia Mono', Consolas, monospace;
  }

  .stats small {
    display: block;
    margin-top: 2px;
    font-size: 9px;
    color: #8f9aa8;
    font-family: system-ui, sans-serif;
  }

  .section {
    font-size: 10px;
    color: #9aa4b2;
    margin: 10px 0 4px;
    text-transform: uppercase;
  }

  .vec3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px;
  }

  .axis-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .axis-field span {
    font-size: 9px;
    color: #9aa4b2;
    font-family: 'Cascadia Mono', Consolas, monospace;
  }

  .axis-field input {
    width: 100%;
    padding: 3px 4px;
    font-size: 12px;
    font-family: 'Cascadia Mono', Consolas, monospace;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 2px;
    color: #d8dee7;
  }

  .axis-field input:focus,
  .inline-input:focus {
    outline: none;
    border-color: #3a7adc;
  }
</style>
