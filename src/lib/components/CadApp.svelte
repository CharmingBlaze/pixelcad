<script lang="ts">
  import KeyboardShortcuts from './KeyboardShortcuts.svelte'
  import MenuBar from './MenuBar.svelte'
  import LeftSidebar from './LeftSidebar.svelte'
  import RightSidebar from './RightSidebar.svelte'
  import QuadViewport from './QuadViewport.svelte'
  import StatusBar from './StatusBar.svelte'
  import { uiLayout } from '../cad/uiLayout.svelte'
</script>

<KeyboardShortcuts />

<div class="cad-app">
  <MenuBar />
  <div class="workspace">
    {#if uiLayout.sidebarsVisible}
      <LeftSidebar />
    {/if}
    <QuadViewport />
    {#if uiLayout.sidebarsVisible}
      <RightSidebar />
    {/if}
  </div>
  <StatusBar />
</div>

<style>
  .cad-app {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #1a1a1a;
    color: #ccc;
    user-select: none;
  }

  .workspace {
    display: flex;
    flex: 1;
    min-height: 0;
  }
</style>
