import { serializeScene, deserializeScene } from './sceneIO'
import type { CadMaterial, CadObject, SceneNode } from './types'
import type { Scene } from 'three'

interface HistoryEntry {
  scene: string
  selectedName: string | null
}

interface HistoryHooks {
  getScene: () => Scene | null
  getObjects: () => CadObject[]
  getGroups: () => SceneNode[]
  getRootNodeIds: () => string[]
  getMaterials: () => CadMaterial[]
  getSelectedName: () => string | null
  setSceneState: (
    objects: CadObject[],
    groups: SceneNode[],
    rootNodeIds: string[],
    counter: number,
    selectedName: string | null,
    materials: CadMaterial[],
  ) => void
  disposeAll: () => void
  bump: () => void
}

const MAX_HISTORY = 50

let undoStack: HistoryEntry[] = []
let redoStack: HistoryEntry[] = []
let restoring = false
let hooks: HistoryHooks | null = null

export const historyState = $state({
  canUndo: false,
  canRedo: false,
})

function updateFlags() {
  historyState.canUndo = undoStack.length > 0
  historyState.canRedo = redoStack.length > 0
}

export function bindHistoryHooks(h: HistoryHooks) {
  hooks = h
}

function captureEntry(): HistoryEntry {
  if (!hooks) return { scene: '{"version":1,"objects":[]}', selectedName: null }
  return {
    scene: serializeScene(
      hooks.getObjects(),
      hooks.getGroups(),
      hooks.getRootNodeIds(),
      hooks.getMaterials(),
    ),
    selectedName: hooks.getSelectedName(),
  }
}

function applyEntry(entry: HistoryEntry) {
  if (!hooks) return
  const scene = hooks.getScene()
  if (!scene) return

  restoring = true
  hooks.disposeAll()

  const { objects, groups, rootNodeIds, counter, materials } = deserializeScene(entry.scene, scene)
  hooks.setSceneState(objects, groups, rootNodeIds, counter, entry.selectedName, materials)
  hooks.bump()
  restoring = false
  updateFlags()
}

export function beginHistoryAction() {
  if (restoring || !hooks) return
  undoStack.push(captureEntry())
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack.length = 0
  updateFlags()
}

export function undo() {
  if (undoStack.length === 0 || !hooks) return
  redoStack.push(captureEntry())
  applyEntry(undoStack.pop()!)
}

export function redo() {
  if (redoStack.length === 0 || !hooks) return
  undoStack.push(captureEntry())
  applyEntry(redoStack.pop()!)
}

export function clearHistory() {
  undoStack = []
  redoStack = []
  updateFlags()
}

export function isRestoringHistory() {
  return restoring
}
