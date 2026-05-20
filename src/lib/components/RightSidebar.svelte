<script lang="ts">
  import SceneGraphPanel from './SceneGraphPanel.svelte'
  import PropertiesPanel from './PropertiesPanel.svelte'
</script>

<div class="right-sidebar">
  <div class="scene-section">
    <SceneGraphPanel />
  </div>
  <div class="properties-section">
    <PropertiesPanel />
  </div>
</div>

<style>
  .right-sidebar {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid #111;
    background: #222426;
  }

  .scene-section,
  .properties-section {
    flex: 1 1 50%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scene-section {
    border-bottom: 1px solid #111;
  }
</style>
