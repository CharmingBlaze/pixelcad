import type { WebGLRenderer, Camera } from 'three'
import type { ViewportConfig } from './types'
import type { ViewportInteraction } from './viewports'

export interface ViewportRuntime {
  el: HTMLDivElement
  canvas: HTMLCanvasElement
  renderer: WebGLRenderer
  camera: Camera
  config: ViewportConfig
  interaction: ViewportInteraction
}
