<script lang="ts">
  import ToolPanel from './ToolPanel.svelte'
</script>

<div class="left-sidebar">
  <ToolPanel />
</div>

<style>
  .left-sidebar {
    width: 210px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid #111;
    background: #232528;
  }
</style>
