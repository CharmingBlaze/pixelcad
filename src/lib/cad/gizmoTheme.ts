import { Color, type Material, type Object3D } from 'three'
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/** App-aligned axis colors (clearly different from default pure RGB). */
export const GIZMO_AXIS_X = 0xe87070
export const GIZMO_AXIS_Y = 0x4fbf9f
export const GIZMO_AXIS_Z = 0x3a7adc
export const GIZMO_ACTIVE = 0xffd64a

type GizmoMaterial = Material & {
  color?: Color
  opacity?: number
  _color?: Color
  _opacity?: number
}

export function applyTransformGizmoColors(controls: TransformControls) {
  controls.setColors(GIZMO_AXIS_X, GIZMO_AXIS_Y, GIZMO_AXIS_Z, GIZMO_ACTIVE)

  // TransformControls clones each handle's color into `_color` on first update.
  // If that happens before setColors(), the defaults stick — refresh the cache.
  controls.getHelper().traverse((child: Object3D) => {
    const material = (child as Object3D & { material?: GizmoMaterial | GizmoMaterial[] }).material
    if (!material) return

    const materials = Array.isArray(material) ? material : [material]
    for (const mat of materials) {
      if (!mat.color) continue
      mat._color = mat.color.clone()
      if (typeof mat.opacity === 'number') mat._opacity = mat.opacity
    }
  })
}

function axisOptions(color: number) {
  return {
    color,
    labelColor: '#eaf4ff',
    hover: {
      color: GIZMO_ACTIVE,
      labelColor: '#ffffff',
      scale: 1.08,
    },
  }
}

export function viewportGizmoThemeOptions() {
  return {
    background: {
      enabled: true,
      color: '#1c1f24',
      opacity: 0.82,
    },
    x: axisOptions(GIZMO_AXIS_X),
    y: axisOptions(GIZMO_AXIS_Y),
    z: axisOptions(GIZMO_AXIS_Z),
    nx: axisOptions(GIZMO_AXIS_X),
    ny: axisOptions(GIZMO_AXIS_Y),
    nz: axisOptions(GIZMO_AXIS_Z),
  }
}
