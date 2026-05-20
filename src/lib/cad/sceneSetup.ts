import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Scene,
} from 'three'

export function createCadScene(): Scene {
  const scene = new Scene()
  scene.background = new Color(0x1a1a1a)
  scene.add(new AmbientLight(0xffffff, 0.5))
  const sun = new DirectionalLight(0xffffff, 0.9)
  sun.position.set(6, 10, 6)
  scene.add(sun)
  const fill = new DirectionalLight(0x6080ff, 0.2)
  fill.position.set(-4, -2, -4)
  scene.add(fill)
  scene.add(new GridHelper(20, 20, 0x2a2a2a, 0x222222))
  return scene
}
