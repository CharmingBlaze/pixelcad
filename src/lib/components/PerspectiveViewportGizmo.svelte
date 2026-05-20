<script lang="ts">
  import { onMount } from 'svelte'
  import type { PerspectiveCamera, WebGLRenderer } from 'three'
  import { createPerspectiveViewportGizmo } from '../cad/perspectiveViewportGizmo'
  import type { ViewportInteraction } from '../cad/viewports'

  let {
    camera,
    renderer,
    container,
    interaction,
    onReady,
    onInteractingChange,
  }: {
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    container: HTMLElement
    interaction: ViewportInteraction
    onReady: (api: ReturnType<typeof createPerspectiveViewportGizmo>) => void
    onInteractingChange: (interacting: boolean) => void
  } = $props()

  onMount(() => {
    const api = createPerspectiveViewportGizmo(camera, renderer, container, interaction)
    const { gizmo } = api

    const onStart = () => onInteractingChange(true)
    const onEnd = () => onInteractingChange(false)
    gizmo.addEventListener('start', onStart)
    gizmo.addEventListener('end', onEnd)

    onReady(api)

    return () => {
      gizmo.removeEventListener('start', onStart)
      gizmo.removeEventListener('end', onEnd)
      api.dispose()
    }
  })
</script>
