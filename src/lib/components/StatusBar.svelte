<script lang="ts">
  import { cadState, drawPrimitiveStatus, statusSelection, vertexCount } from '../cad/cadState.svelte'

  const modeLabel = $derived(
    `${cadState.editMode.charAt(0).toUpperCase()}${cadState.editMode.slice(1)} Mode`,
  )
  const drawHint = $derived(drawPrimitiveStatus())
</script>

<footer class="statusbar">
  <span>{modeLabel}</span>
  <span>{statusSelection()}</span>
  <span>Verts: {vertexCount()}</span>
  {#if drawHint}
    <span class="draw-hint">{drawHint}</span>
  {:else}
    <span>Tab: panels | Shift+3/4/5: poly draw | E: extrude | 1-4: modes</span>
  {/if}
</footer>

<style>
  .statusbar {
    height: 22px;
    background: #222;
    border-top: 1px solid #111;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 16px;
    flex-shrink: 0;
  }

  .statusbar span {
    font-size: 11px;
    color: #8f9aa8;
    font-family: 'Cascadia Mono', Consolas, monospace;
  }

  .draw-hint {
    color: #9dccff;
  }
</style>
