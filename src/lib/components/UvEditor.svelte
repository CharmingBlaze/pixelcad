<script lang="ts">
  import { TextureLoader, type Mesh } from 'three'
  import { cadState, getSelected, refreshObject } from '../cad/cadState.svelte'
  import {
    getUvIsland,
    islandKeyForSelection,
    moveIslandUv,
    prepareUvIsland,
    saveIslandUvSnapshot,
    setVertexUv,
    syncSelectedUvIsland,
    type UvFaceIsland,
  } from '../cad/uvEditor'

  let editorEl = $state<HTMLElement>()
  let gridCanvas = $state<HTMLCanvasElement>()
  let fileInput: HTMLInputElement | undefined
  let imageUrl = $state<string | null>(null)
  let imageName = $state('No image')
  let importError = $state('')
  let dragOverImage = $state(false)
  let viewZoom = $state(1)
  let viewPanX = $state(0)
  let viewPanY = $state(0)
  let drag:
    | {
        kind: 'handle'
        vertexIndex: number
        faceIndices: number[]
        pointerId: number
      }
    | {
        kind: 'island'
        island: UvFaceIsland
        startX: number
        startY: number
        pointerId: number
      }
    | {
        kind: 'pan'
        startX: number
        startY: number
        originX: number
        originY: number
      }
    | null = null

  const selected = $derived(getSelected())
  let previousIslandKey = ''
  let previousIslandMesh: Mesh | null = null
  let lastPreparedIslandKey = ''
  let dragCaptureEl: HTMLElement | null = null

  const meshImage = $derived.by(() => {
    cadState.revision
    cadState.selectedId
    const sel = getSelected()
    if (!sel) return { url: null as string | null, name: 'No image' }
    return {
      url: (sel.mesh.userData.uvImageUrl as string | undefined) ?? null,
      name: (sel.mesh.userData.uvImageName as string | undefined) ?? 'No image',
    }
  })

  const displayImageUrl = $derived(meshImage.url ?? imageUrl)
  const displayImageName = $derived(meshImage.url ? meshImage.name : imageName)

  $effect(() => {
    cadState.selectedId
    const selectedFaces = [...cadState.selFaces]
    const sel = getSelected()
    const currentKey =
      sel && selectedFaces.length > 0 ? islandKeyForSelection(sel.mesh, selectedFaces) : ''

    if (previousIslandMesh && previousIslandKey && previousIslandKey !== currentKey) {
      const prevFaces = previousIslandKey.split(',').map((value) => Number(value))
      saveIslandUvSnapshot(previousIslandMesh, prevFaces)
    }

    if (!sel || selectedFaces.length === 0) {
      previousIslandKey = ''
      previousIslandMesh = null
      lastPreparedIslandKey = ''
      return
    }

    const geometryChanged = prepareUvIsland(sel.mesh, new Set(selectedFaces))
    const shouldRestore = !geometryChanged && currentKey !== lastPreparedIslandKey
    const restored = shouldRestore ? syncSelectedUvIsland(sel.mesh, new Set(selectedFaces)) : false
    if (geometryChanged || restored) {
      refreshObject(sel)
      cadState.revision++
    }

    lastPreparedIslandKey = currentKey
    previousIslandKey = currentKey
    previousIslandMesh = sel.mesh
  })

  const island = $derived.by(() => {
    cadState.revision
    cadState.selectedId
    const selectedFaces = [...cadState.selFaces]
    return selected ? getUvIsland(selected.mesh, new Set(selectedFaces)) : null
  })

  $effect(() => {
    cadState.selectedId
    cadState.revision
    const sel = getSelected()
    if (!sel) return

    const url = sel.mesh.userData.uvImageUrl as string | undefined
    const name = sel.mesh.userData.uvImageName as string | undefined
    if (url && !sel.mesh.userData.uvTexture) {
      applyTextureToSelection(url, name || 'Texture')
    }
  })

  function onImagePick(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    void importImageFile(file)
    input.value = ''
  }

  async function openImportDialog(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    importError = ''

    try {
      if ('showOpenFilePicker' in window) {
        const showOpenFilePicker = (
          window as Window & {
            showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]>
          }
        ).showOpenFilePicker
        const [handle] = await showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Images',
              accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'] },
            },
          ],
        })
        const file = await handle.getFile()
        await importImageFile(file)
        return
      }
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return
    }

    fileInput?.click()
  }

  function stopToolbarPointer(e: PointerEvent | MouseEvent) {
    e.stopPropagation()
  }

  function editorRect() {
    const rect = editorEl?.getBoundingClientRect()
    if (!rect) return null
    const toolbar = 74
    const margin = 42
    const availableWidth = Math.max(1, rect.width - margin * 2)
    const availableHeight = Math.max(1, rect.height - toolbar - margin)
    const baseSize = Math.max(1, Math.min(availableWidth, availableHeight))
    const size = Math.round(baseSize * viewZoom)
    const centerX = rect.width / 2 + viewPanX
    const centerY = toolbar + availableHeight / 2 + viewPanY
    return {
      left: Math.round(centerX - size / 2),
      top: Math.round(centerY - size / 2),
      size,
      baseSize,
    }
  }

  function drawUvGrid(canvas: HTMLCanvasElement, size: number) {
    const dpr = window.devicePixelRatio || 1
    const px = Math.max(1, Math.round(size))
    canvas.width = px * dpr
    canvas.height = px * dpr
    canvas.style.width = `${px}px`
    canvas.style.height = `${px}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, px, px)

    const minorDivisions = 20
    const majorEvery = 5

    for (let i = 0; i <= minorDivisions; i++) {
      const t = i / minorDivisions
      const pos = Math.round(t * px) + 0.5
      const major = i % majorEvery === 0
      ctx.strokeStyle = major ? 'rgba(134, 166, 187, 0.42)' : 'rgba(126, 149, 164, 0.16)'
      ctx.lineWidth = major ? 1 : 1

      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, px)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(px, pos)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(90, 110, 124, 0.85)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, px - 1, px - 1)
  }

  $effect(() => {
    const canvas = gridCanvas
    const host = editorEl
    viewZoom
    viewPanX
    viewPanY
    if (!canvas || !host) return

    const redraw = () => {
      const rect = editorRect()
      if (!rect) return
      drawUvGrid(canvas, rect.size)
    }

    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(host)
    return () => observer.disconnect()
  })

  function pointStyle(u: number, v: number) {
    const r = editorRect()
    if (!r) return ''
    return `left: ${r.left + u * r.size}px; top: ${r.top + (1 - v) * r.size}px;`
  }

  function boardStyle() {
    const r = editorRect()
    if (!r) return ''
    return `left: ${r.left}px; top: ${r.top}px; width: ${r.size}px; height: ${r.size}px;`
  }

  function polygonPoints(points: UvFaceIsland['points']) {
    const r = editorRect()
    if (!r) return ''
    return points
      .map((point) => `${point.uv.x * r.size},${(1 - point.uv.y) * r.size}`)
      .join(' ')
  }

  function pointerToUv(e: PointerEvent) {
    const r = editorRect()
    if (!r || !editorEl) return null
    const bounds = editorEl.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    return {
      u: Math.max(0, Math.min(1, (x - r.left) / r.size)),
      v: Math.max(0, Math.min(1, 1 - (y - r.top) / r.size)),
    }
  }

  function isImageFile(file: File) {
    if (file.type.startsWith('image/')) return true
    return /\.(png|jpe?g|webp|gif|bmp|svg|tga)$/i.test(file.name)
  }

  async function importImageFile(file: File) {
    importError = ''
    const valid = isImageFile(file)
    if (!valid) {
      importError = 'Choose a PNG, JPG, or other image file.'
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const sel = getSelected()
      if (sel) {
        sel.mesh.userData.uvImageUrl = dataUrl
        sel.mesh.userData.uvImageName = file.name
        cadState.revision++
      }
      imageUrl = dataUrl
      imageName = file.name
      applyTextureToSelection(dataUrl, file.name)
    } catch {
      importError = 'Could not load that image.'
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Invalid image data'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
      reader.readAsDataURL(file)
    })
  }

  function applyTextureToSelection(url: string, name: string) {
    const sel = getSelected()
    if (!sel) return

    sel.mesh.userData.uvImageUrl = url
    sel.mesh.userData.uvImageName = name

    if (sel.mesh.userData.uvTexture && sel.mesh.userData.uvImageUrl === url) {
      refreshObject(sel)
      return
    }

    new TextureLoader().load(
      url,
      (texture) => {
        texture.needsUpdate = true
        const current = getSelected()
        if (!current) return
        current.mesh.userData.uvTexture = texture
        current.mesh.userData.uvImageUrl = url
        current.mesh.userData.uvImageName = name
        refreshObject(current)
      },
      undefined,
      () => {
        importError = 'Could not apply texture to the selected object.'
      },
    )
  }

  function imageFileFromDrop(dataTransfer: DataTransfer | null): File | null {
    if (!dataTransfer) return null
    const fromItems = [...dataTransfer.items]
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .find((file) => file && isImageFile(file))
    if (fromItems) return fromItems
    return [...dataTransfer.files].find((file) => isImageFile(file)) ?? null
  }

  function onDragEnter(e: DragEvent) {
    if (!imageFileFromDrop(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragOverImage = true
  }

  function onDragOver(e: DragEvent) {
    if (!imageFileFromDrop(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragOverImage = true
  }

  function onDragLeave(e: DragEvent) {
    e.stopPropagation()
    if (e.currentTarget === e.target) dragOverImage = false
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragOverImage = false
    const file = imageFileFromDrop(e.dataTransfer)
    if (file) void importImageFile(file)
  }

  function beginHandleDrag(e: PointerEvent, vertexIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragCaptureEl = e.currentTarget as HTMLElement
    drag = { kind: 'handle', vertexIndex, faceIndices: island?.faceIndices ?? [], pointerId: e.pointerId }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  function beginIslandDrag(e: PointerEvent) {
    if (!island) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragCaptureEl = e.currentTarget as HTMLElement
    drag = {
      kind: 'island',
      island: {
        faceIndices: island.faceIndices,
        points: island.points.map((point) => ({
          vertexIndex: point.vertexIndex,
          uv: point.uv.clone(),
        })),
      },
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  function beginPan(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    if ((e.target as HTMLElement).closest('.uv-toolbar, .uv-handle, .uv-face, .import-button')) return
    e.preventDefault()
    drag = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      originX: viewPanX,
      originY: viewPanY,
    }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  function onDrag(e: PointerEvent) {
    const sel = getSelected()
    if (!drag) return

    if (drag.kind === 'pan') {
      viewPanX = drag.originX + e.clientX - drag.startX
      viewPanY = drag.originY + e.clientY - drag.startY
      return
    }

    if (!sel) return

    const faceIndices = drag.kind === 'island' ? drag.island.faceIndices : drag.faceIndices

    if (drag.kind === 'handle') {
      const uv = pointerToUv(e)
      if (!uv) return
      setVertexUv(sel.mesh, drag.vertexIndex, uv.u, uv.v)
    } else {
      const r = editorRect()
      if (!r) return
      moveIslandUv(sel.mesh, drag.island, (e.clientX - drag.startX) / r.size, -(e.clientY - drag.startY) / r.size)
    }

    if (faceIndices.length > 0) {
      saveIslandUvSnapshot(sel.mesh, faceIndices)
    }

    cadState.revision++
  }

  function endDrag() {
    const sel = getSelected()
    const activeDrag = drag
    if (sel && activeDrag && activeDrag.kind !== 'pan') {
      const faceIndices = activeDrag.kind === 'island' ? activeDrag.island.faceIndices : activeDrag.faceIndices
      if (faceIndices.length > 0) {
        saveIslandUvSnapshot(sel.mesh, faceIndices)
      }
    }
    if (dragCaptureEl && activeDrag && activeDrag.kind !== 'pan') {
      try {
        dragCaptureEl.releasePointerCapture(activeDrag.pointerId)
      } catch {
        // ignore release errors
      }
    }
    dragCaptureEl = null
    if (sel) refreshObject(sel)
    drag = null
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const before = clientX !== undefined && clientY !== undefined ? pointerToUvPoint(clientX, clientY) : null
    viewZoom = Math.max(0.35, Math.min(8, viewZoom * factor))
    if (before && editorEl) {
      const after = uvToClient(before.u, before.v)
      viewPanX += clientX! - after.x
      viewPanY += clientY! - after.y
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY)
  }

  function pointerToUvPoint(clientX: number, clientY: number) {
    const r = editorRect()
    const bounds = editorEl?.getBoundingClientRect()
    if (!r || !bounds) return null
    return {
      u: (clientX - bounds.left - r.left) / r.size,
      v: 1 - (clientY - bounds.top - r.top) / r.size,
    }
  }

  function uvToClient(u: number, v: number) {
    const r = editorRect()
    const bounds = editorEl?.getBoundingClientRect()
    if (!r || !bounds) return { x: 0, y: 0 }
    return {
      x: bounds.left + r.left + u * r.size,
      y: bounds.top + r.top + (1 - v) * r.size,
    }
  }

  function fitView() {
    viewZoom = 1
    viewPanX = 0
    viewPanY = 0
  }

  function zoomIn() {
    zoomAt(1.2)
  }

  function zoomOut() {
    zoomAt(1 / 1.2)
  }

  function editIsland(transform: (u: number, v: number) => [number, number]) {
    const sel = getSelected()
    if (!sel || !island) return
    for (const point of island.points) {
      const [u, v] = transform(point.uv.x, point.uv.y)
      setVertexUv(sel.mesh, point.vertexIndex, u, v)
    }
    saveIslandUvSnapshot(sel.mesh, island.faceIndices)
    refreshObject(sel)
    cadState.revision++
  }

  function flipU() {
    editIsland((u, v) => [1 - u, v])
  }

  function flipV() {
    editIsland((u, v) => [u, 1 - v])
  }

  function rotate90() {
    editIsland((u, v) => [v, 1 - u])
  }

  function centerIsland() {
    if (!island) return
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    island.points.forEach((point) => {
      minU = Math.min(minU, point.uv.x)
      maxU = Math.max(maxU, point.uv.x)
      minV = Math.min(minV, point.uv.y)
      maxV = Math.max(maxV, point.uv.y)
    })
    const du = 0.5 - (minU + maxU) / 2
    const dv = 0.5 - (minV + maxV) / 2
    editIsland((u, v) => [u + du, v + dv])
  }
</script>

<section
  class="uv-editor"
  class:uv-drag-over={dragOverImage}
  bind:this={editorEl}
  role="application"
  aria-label="UV editor workspace"
  onwheel={onWheel}
  onpointerdown={beginPan}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <div
    class="uv-toolbar"
    role="toolbar"
    aria-label="UV editor tools"
    onpointerdown={stopToolbarPointer}
    onmousedown={stopToolbarPointer}
  >
    <div>
      <div class="uv-title">UV Editor</div>
      <div class="uv-subtitle" class:uv-error={!!importError}>{importError || displayImageName}</div>
    </div>
    <button type="button" class="uv-tool" title="Fit view" onclick={fitView}>Fit</button>
    <button type="button" class="uv-tool" title="Zoom out" onclick={zoomOut}>-</button>
    <button type="button" class="uv-tool" title="Zoom in" onclick={zoomIn}>+</button>
    <button type="button" class="uv-tool" disabled={!island} title="Center selected UV island" onclick={centerIsland}>Center</button>
    <button type="button" class="uv-tool" disabled={!island} title="Flip selected UV island horizontally" onclick={flipU}>Flip U</button>
    <button type="button" class="uv-tool" disabled={!island} title="Flip selected UV island vertically" onclick={flipV}>Flip V</button>
    <button type="button" class="uv-tool" disabled={!island} title="Rotate selected UV island 90 degrees" onclick={rotate90}>Rot 90</button>
    <button
      type="button"
      class="import-button"
      title="Import texture image"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={openImportDialog}
    >
      Import
    </button>
  </div>

  <input
    bind:this={fileInput}
    class="file-input"
    type="file"
    accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg"
    tabindex="-1"
    aria-hidden="true"
    onchange={onImagePick}
  />

  <div class="uv-board" style={boardStyle()}>
    {#if displayImageUrl}
      <img class="uv-image" src={displayImageUrl} alt="" />
    {:else}
      <div class="empty-text">Import or drop an image to place UVs over it.</div>
    {/if}
    <canvas bind:this={gridCanvas} class="uv-grid" aria-hidden="true"></canvas>
  </div>

  {#if island}
    <svg class="uv-overlay" style={boardStyle()} aria-hidden="true">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <polygon
        points={polygonPoints(island.points)}
        class="uv-face"
        onpointerdown={beginIslandDrag}
      />
      <polyline
        points={polygonPoints([...island.points, island.points[0]])}
        class="uv-outline"
      />
    </svg>
    {#each island.points as point (point.vertexIndex)}
      <button
        type="button"
        class="uv-handle"
        style={pointStyle(point.uv.x, point.uv.y)}
        title="Move UV vertex"
        onpointerdown={(e) => beginHandleDrag(e, point.vertexIndex)}
      ></button>
    {/each}
  {:else}
    <div class="uv-empty-selection">Select a face on the left.</div>
  {/if}
</section>

<style>
  .uv-editor {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(circle at center, rgba(84, 103, 116, 0.1), transparent 58%),
      #151719;
    outline: 1px solid #2d2f31;
    outline-offset: -1px;
    cursor: grab;
  }

  .uv-editor.uv-drag-over {
    outline-color: #4d94e8;
    box-shadow: inset 0 0 0 2px rgba(77, 148, 232, 0.35);
  }

  .uv-editor.uv-drag-over .uv-board {
    border-color: #5a9de8;
    box-shadow:
      0 16px 50px rgba(0, 0, 0, 0.28),
      inset 0 0 0 2px rgba(77, 148, 232, 0.45);
  }

  .uv-toolbar {
    position: absolute;
    top: 8px;
    left: 10px;
    right: 10px;
    z-index: 8;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    min-height: 42px;
    flex-wrap: wrap;
  }

  .uv-title {
    color: #9dccff;
    font-family: monospace;
    font-size: 11px;
    text-transform: uppercase;
  }

  .uv-subtitle {
    margin-top: 2px;
    max-width: 280px;
    overflow: hidden;
    color: #737f8f;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .uv-subtitle.uv-error {
    color: #ff8d8d;
  }

  .import-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 10px;
    border: 1px solid #345f93;
    border-radius: 3px;
    color: #d9ecff;
    background: #174b87;
    font-size: 11px;
    cursor: pointer;
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .uv-tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    min-width: 28px;
    padding: 0 8px;
    border: 1px solid #3a3f45;
    border-radius: 3px;
    color: #c9d4df;
    background: #202429;
    font-size: 11px;
    cursor: pointer;
  }

  .uv-tool:hover:not(:disabled) {
    color: #f4fbff;
    border-color: #426f9e;
    background: #263445;
  }

  .uv-tool:disabled {
    opacity: 0.42;
    cursor: default;
  }

  .import-button:hover {
    color: #f4fbff;
    border-color: #4d8fd4;
    background: #1d5ea3;
  }

  .uv-board,
  .uv-overlay {
    position: absolute;
  }

  .uv-board {
    display: grid;
    place-items: center;
    overflow: hidden;
    background-color: #101417;
    border: 1px solid #3b454d;
    box-shadow:
      0 16px 50px rgba(0, 0, 0, 0.28),
      inset 0 0 0 1px rgba(255, 255, 255, 0.035);
  }

  .uv-image {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
  }

  .uv-grid {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  .empty-text,
  .uv-empty-selection {
    position: relative;
    z-index: 0;
    color: #7b8794;
    font-size: 12px;
    pointer-events: none;
    text-align: center;
    padding: 0 16px;
  }

  .uv-empty-selection {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
  }

  .uv-overlay {
    z-index: 2;
    overflow: visible;
    pointer-events: none;
  }

  .uv-face {
    fill: rgba(52, 145, 255, 0.24);
    stroke: none;
    cursor: move;
    pointer-events: auto;
  }

  .uv-outline {
    fill: none;
    stroke: #8edcff;
    stroke-width: 1.8;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .uv-handle {
    position: absolute;
    z-index: 3;
    width: 10px;
    height: 10px;
    padding: 0;
    border: 2px solid #071015;
    border-radius: 50%;
    background: #b9fbff;
    box-shadow: 0 0 0 1px rgba(142, 220, 255, 0.8);
    transform: translate(-50%, -50%);
    cursor: grab;
  }

  .uv-handle:hover {
    background: #fff06a;
    box-shadow: 0 0 0 2px rgba(255, 240, 106, 0.35);
  }
</style>
