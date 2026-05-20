<script lang="ts">
  import { beginHistoryAction } from '../cad/history.svelte'
  import {
    assignSelectedMaterial,
    cadState,
    createMaterial,
    deleteMaterial,
    duplicateMaterial,
    getSelected,
    patchMaterial,
  } from '../cad/cadState.svelte'
  import { DEFAULT_MATERIAL_ID } from '../cad/materials'

  const sel = $derived(getSelected())
  const showObject = $derived(!!sel && cadState.editMode === 'object')

  let activeMaterialId = $state(DEFAULT_MATERIAL_ID)
  let selectionMaterialKey = $state('')
  let editHistoryStarted = false

  const activeMaterial = $derived(
    cadState.materials.find((mat) => mat.id === activeMaterialId) ?? cadState.materials[0],
  )

  $effect(() => {
    cadState.editMode
    const selected = getSelected()
    const nextKey =
      selected && cadState.editMode === 'object'
        ? `${selected.id}:${selected.materialId}`
        : ''
    if (nextKey === selectionMaterialKey) return
    selectionMaterialKey = nextKey
    if (selected && cadState.editMode === 'object') {
      activeMaterialId = selected.materialId
    }
  })

  function selectMaterial(id: string) {
    activeMaterialId = id
    editHistoryStarted = false
    const selected = getSelected()
    if (selected && cadState.editMode === 'object' && selected.materialId !== id) {
      assignSelectedMaterial(id)
    }
  }

  function beginEdit() {
    if (!editHistoryStarted) {
      beginHistoryAction()
      editHistoryStarted = true
    }
  }

  function commitField(patch: Parameters<typeof patchMaterial>[1]) {
    if (!activeMaterial) return
    beginEdit()
    patchMaterial(activeMaterial.id, patch)
  }

  function onNewMaterial() {
    activeMaterialId = createMaterial()
    editHistoryStarted = false
  }

  function onDuplicateMaterial() {
    if (!activeMaterial) return
    const id = duplicateMaterial(activeMaterial.id)
    if (id) {
      activeMaterialId = id
      editHistoryStarted = false
    }
  }

  function onDeleteMaterial() {
    if (!activeMaterial) return
    if (!deleteMaterial(activeMaterial.id)) return
    activeMaterialId = DEFAULT_MATERIAL_ID
    editHistoryStarted = false
  }

  function applyToSelected() {
    if (!sel || !activeMaterial) return
    assignSelectedMaterial(activeMaterial.id)
  }
</script>

<div class="materials-panel">
  {#if cadState.shadingMode !== 'solid'}
    <p class="hint warn">Use Solid shading in the tool panel to preview material colors.</p>
  {/if}

  <div class="material-list">
    {#each cadState.materials as mat (mat.id)}
      <button
        type="button"
        class="material-row"
        class:active={mat.id === activeMaterialId}
        class:assigned={showObject && sel?.materialId === mat.id}
        onclick={() => selectMaterial(mat.id)}
      >
        <span class="swatch" style={`background:${mat.color}`} aria-hidden="true"></span>
        <span class="material-name">{mat.name}</span>
      </button>
    {/each}
  </div>

  {#if activeMaterial}
    <div class="material-editor">
      <div class="preview-row">
        <label class="color-picker" title="Pick material color">
          <input
            type="color"
            class="color-input"
            value={activeMaterial.color}
            onfocus={beginEdit}
            oninput={(e) => commitField({ color: e.currentTarget.value })}
          />
          <span class="preview-swatch" style={`background:${activeMaterial.color}`}></span>
        </label>
        <label class="name-field">
          <span>Name</span>
          <input
            value={activeMaterial.name}
            onfocus={beginEdit}
            oninput={(e) => commitField({ name: e.currentTarget.value })}
          />
        </label>
      </div>

      <label class="field slider-field">
        <span>Roughness</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={activeMaterial.roughness}
          onfocus={beginEdit}
          oninput={(e) => commitField({ roughness: Number(e.currentTarget.value) })}
        />
        <span class="value">{Math.round(activeMaterial.roughness * 100)}%</span>
      </label>

      <label class="field slider-field">
        <span>Metalness</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={activeMaterial.metalness}
          onfocus={beginEdit}
          oninput={(e) => commitField({ metalness: Number(e.currentTarget.value) })}
        />
        <span class="value">{Math.round(activeMaterial.metalness * 100)}%</span>
      </label>

      <label class="toggle-field">
        <input
          type="checkbox"
          checked={activeMaterial.flatShading}
          onchange={(e) => commitField({ flatShading: e.currentTarget.checked })}
        />
        <span>Flat shading</span>
      </label>

      <div class="actions">
        <button type="button" class="action-btn" onclick={onNewMaterial}>New</button>
        <button type="button" class="action-btn" onclick={onDuplicateMaterial}>Duplicate</button>
        <button
          type="button"
          class="action-btn danger"
          disabled={activeMaterial.id === DEFAULT_MATERIAL_ID || cadState.materials.length <= 1}
          onclick={onDeleteMaterial}
        >
          Delete
        </button>
      </div>

      {#if showObject && sel}
        <button
          type="button"
          class="apply-btn"
          disabled={sel.materialId === activeMaterial.id}
          onclick={applyToSelected}
        >
          {sel.materialId === activeMaterial.id ? 'Assigned to selection' : 'Apply to selection'}
        </button>
      {:else}
        <p class="hint">Select an object in Object mode to assign this material.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .materials-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .material-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .material-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: #1a1a1a;
    color: #d8dee7;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .material-row:hover {
    border-color: #333;
    background: #1f1f1f;
  }

  .material-row.active {
    border-color: #3a7adc;
    background: #1a2740;
  }

  .material-row.assigned .material-name::after {
    content: ' •';
    color: #6ea8ff;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    border: 1px solid #444;
    flex-shrink: 0;
  }

  .material-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .material-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 2px;
    border-top: 1px solid #333;
  }

  .preview-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .color-picker {
    position: relative;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .color-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
  }

  .preview-swatch {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    border: 1px solid #444;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .color-picker:focus-within .preview-swatch {
    border-color: #3a7adc;
    box-shadow: 0 0 0 1px #3a7adc;
  }

  .name-field {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: #9aa4b2;
    text-transform: uppercase;
  }

  .name-field input {
    width: 100%;
    padding: 3px 4px;
    font-size: 12px;
    font-family: 'Cascadia Mono', Consolas, monospace;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 2px;
    color: #d8dee7;
  }

  .field {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #9aa4b2;
  }

  .slider-field {
    grid-template-columns: 1fr 1fr auto;
  }

  .slider-field input[type='range'] {
    width: 100%;
    accent-color: #3a7adc;
  }

  .value {
    min-width: 34px;
    text-align: right;
    font-family: 'Cascadia Mono', Consolas, monospace;
    color: #d8dee7;
    font-size: 11px;
  }

  .toggle-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #c5ced9;
  }

  .toggle-field input {
    accent-color: #3a7adc;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .action-btn,
  .apply-btn {
    padding: 5px 6px;
    border: 1px solid #333;
    border-radius: 2px;
    background: #1a1a1a;
    color: #d8dee7;
    font-size: 11px;
    cursor: pointer;
  }

  .action-btn:hover:not(:disabled),
  .apply-btn:hover:not(:disabled) {
    border-color: #3a7adc;
    background: #1a2740;
  }

  .action-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .action-btn.danger:hover:not(:disabled) {
    border-color: #b44;
    background: #3a1a1a;
  }

  .apply-btn {
    width: 100%;
    margin-top: 2px;
  }

  .apply-btn:disabled {
    opacity: 0.7;
    cursor: default;
    border-color: #2a5a9a;
    background: #1a2740;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    color: #8f9aa8;
    line-height: 1.4;
  }

  .hint.warn {
    padding: 6px 8px;
    border: 1px solid #5a4a1a;
    border-radius: 2px;
    background: #2a2418;
    color: #d8c27a;
  }

  input:focus {
    outline: none;
    border-color: #3a7adc;
  }
</style>
