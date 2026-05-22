import {
  NoToneMapping,
  Vector4,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three'
import { ViewportGizmo } from 'three-viewport-gizmo'
import { viewportGizmoThemeOptions } from './gizmoTheme'
import type { ViewportInteraction } from './viewports'

export const PERSP_VP_INDEX = 1
export const PERSP_GIZMO_CLASS = 'cad-viewport-gizmo'

export function createPerspectiveViewportGizmo(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  container: HTMLElement,
  interaction: ViewportInteraction,
) {
  const viewport = new Vector4()
  const gizmo = new ViewportGizmo(camera, renderer, {
    ...viewportGizmoThemeOptions(),
    container,
    placement: 'bottom-right',
    size: 96,
    className: PERSP_GIZMO_CLASS,
    offset: { right: 10, bottom: 10 },
  })
  gizmo.target.copy(interaction.orbitTarget)

  gizmo.addEventListener('change', () => {
    interaction.orbitTarget.copy(gizmo.target)
  })

  function syncTarget() {
    gizmo.target.copy(interaction.orbitTarget)
    gizmo.update(false)
  }

  function render() {
    const toneMapping = renderer.toneMapping
    renderer.getViewport(viewport)
    renderer.toneMapping = NoToneMapping
    gizmo.render()
    renderer.setViewport(viewport)
    renderer.toneMapping = toneMapping
  }

  return {
    gizmo,
    syncTarget,
    render,
    dispose: () => gizmo.dispose(),
  }
}

export type PerspectiveGizmoApi = ReturnType<typeof createPerspectiveViewportGizmo>
