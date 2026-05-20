<script lang="ts">
  import { tick } from 'svelte'
  import {
    addGroup,
    cadState,
    renameNode,
    reorderNode,
    selectGroup,
    selectObject,
    setGroupLocked,
    setGroupVisible,
    setObjectLocked,
    setObjectVisible,
  } from '../cad/cadState.svelte'
  import type { CadObject, SceneNode } from '../cad/types'

  let editingId = $state<string | null>(null)
  let draftName = $state('')
  let draggedId = $state<string | null>(null)
  let expandedGroupIds = $state(new Set<string>())
  let dropTarget = $state<{ id: string; position: 'above' | 'below' | 'inside' } | null>(null)

  const rootIds = $derived(
    cadState.rootNodeIds.length
      ? cadState.rootNodeIds
      : cadState.objects.filter((obj) => !obj.node.parentId).map((obj) => obj.id),
  )

  function objectById(id: string): CadObject | undefined {
    return cadState.objects.find((obj) => obj.id === id)
  }

  function groupById(id: string): SceneNode | undefined {
    return cadState.groups.find((group) => group.id === id)
  }

  function isSelected(id: string) {
    return cadState.selectedId === id || cadState.selectedGroupId === id
  }

  function isExpanded(id: string) {
    return expandedGroupIds.has(id)
  }

  function toggleGroup(id: string) {
    const next = new Set(expandedGroupIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedGroupIds = next
  }

  function createGroup() {
    addGroup()
    void tick().then(() => {
      const group = cadState.groups[cadState.groups.length - 1]
      if (group) {
        expandedGroupIds = new Set([...expandedGroupIds, group.id])
        beginRename(group.id, group.name)
      }
    })
  }

  function beginRename(id: string, name: string) {
    editingId = id
    draftName = name
    void tick().then(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-rename-id="${id}"]`)
      input?.focus()
      input?.select()
    })
  }

  function commitRename() {
    if (!editingId) return
    renameNode(editingId, draftName)
    editingId = null
    draftName = ''
  }

  function cancelRename() {
    editingId = null
    draftName = ''
  }

  function onNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') cancelRename()
  }

  function onDragStart(e: DragEvent, id: string) {
    draggedId = id
    e.dataTransfer?.setData('text/plain', id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: DragEvent, id: string, targetKind: 'object' | 'group') {
    if (!draggedId || draggedId === id) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - rect.top) / Math.max(1, rect.height)
    const canDropInside = targetKind === 'group' && !groupById(draggedId)
    dropTarget = {
      id,
      position: canDropInside && y > 0.28 && y < 0.72 ? 'inside' : y < 0.5 ? 'above' : 'below',
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function onDrop(e: DragEvent, id: string) {
    e.preventDefault()
    const movedId = draggedId ?? e.dataTransfer?.getData('text/plain')
    if (movedId && dropTarget) {
      reorderNode(movedId, id, dropTarget.position)
      if (dropTarget.position === 'inside') expandedGroupIds = new Set([...expandedGroupIds, id])
    }
    clearDrag()
  }

  function clearDrag() {
    draggedId = null
    dropTarget = null
  }

  function rowKeydown(e: KeyboardEvent, select: () => void) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    select()
  }
</script>

<aside class="outliner">
  <header class="panel-header">
    <span>Scene</span>
    <button type="button" title="Add group" onclick={createGroup}>Group</button>
  </header>

  <div class="scene-list" role="listbox" aria-label="Scene objects" tabindex="0" ondragend={clearDrag} ondragleave={(e) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) clearDrag()
  }}>
    {#if cadState.objects.length === 0 && cadState.groups.length === 0}
      <p class="empty">No objects</p>
    {:else}
      {#each rootIds as nodeId (nodeId)}
        {@const group = groupById(nodeId)}
        {@const obj = objectById(nodeId)}

        {#if group}
          <div
            class="scene-row group-row"
            class:selected={isSelected(group.id)}
            class:dragging={draggedId === group.id}
            class:drop-above={dropTarget?.id === group.id && dropTarget.position === 'above'}
            class:drop-below={dropTarget?.id === group.id && dropTarget.position === 'below'}
            class:drop-inside={dropTarget?.id === group.id && dropTarget.position === 'inside'}
            draggable={editingId !== group.id}
            ondragstart={(e) => onDragStart(e, group.id)}
            ondragover={(e) => onDragOver(e, group.id, 'group')}
            ondrop={(e) => onDrop(e, group.id)}
            onclick={() => selectGroup(group.id)}
            onkeydown={(e) => rowKeydown(e, () => selectGroup(group.id))}
            role="option"
            aria-selected={isSelected(group.id)}
            tabindex="0"
          >
            <span class="drag-handle" title="Drag to reorder">::</span>
            <button
              type="button"
              class="icon-toggle"
              class:off={!group.visible}
              title={group.visible ? 'Hide group' : 'Show group'}
              onclick={(e) => {
                e.stopPropagation()
                setGroupVisible(group.id, !group.visible)
              }}
            >
              {group.visible ? 'V' : '-'}
            </button>
            <span class="node-kind group-kind">GR</span>
            <div class="name-cell">
              <button
                type="button"
                class="expander"
                title={isExpanded(group.id) ? 'Collapse group' : 'Expand group'}
                onclick={(e) => {
                  e.stopPropagation()
                  toggleGroup(group.id)
                }}
              >
                {isExpanded(group.id) ? '-' : '+'}
              </button>
              {#if editingId === group.id}
                <input
                  class="name-input"
                  data-rename-id={group.id}
                  bind:value={draftName}
                  onclick={(e) => e.stopPropagation()}
                  onblur={commitRename}
                  onkeydown={onNameKeydown}
                />
              {:else}
                <button
                  type="button"
                  class="node-name"
                  title="Double-click to rename"
                  ondblclick={(e) => {
                    e.stopPropagation()
                    beginRename(group.id, group.name)
                  }}
                >
                  {group.name}
                </button>
              {/if}
            </div>
            <span class="node-stats" title={`${group.children.length} children`}>{group.children.length}</span>
            <button
              type="button"
              class="icon-toggle lock"
              class:on={group.locked}
              title={group.locked ? 'Unlock group' : 'Lock group'}
              onclick={(e) => {
                e.stopPropagation()
                setGroupLocked(group.id, !group.locked)
              }}
            >
              {group.locked ? 'L' : '-'}
            </button>
          </div>

          {#if isExpanded(group.id)}
            {#each group.children as childId (childId)}
              {@const child = objectById(childId)}
              {#if child}
                <div
                  class="scene-row child-row"
                  class:selected={isSelected(child.id)}
                  class:dragging={draggedId === child.id}
                  class:drop-above={dropTarget?.id === child.id && dropTarget.position === 'above'}
                  class:drop-below={dropTarget?.id === child.id && dropTarget.position === 'below'}
                  draggable={editingId !== child.id}
                  ondragstart={(e) => onDragStart(e, child.id)}
                  ondragover={(e) => onDragOver(e, child.id, 'object')}
                  ondrop={(e) => onDrop(e, child.id)}
                  onclick={() => selectObject(child.id)}
                  onkeydown={(e) => rowKeydown(e, () => selectObject(child.id))}
                  role="option"
                  aria-selected={isSelected(child.id)}
                  tabindex="0"
                >
                  <span class="drag-handle" title="Drag to reorder">::</span>
                  <button
                    type="button"
                    class="icon-toggle"
                    class:off={!child.node.visible}
                    title={child.node.visible ? 'Hide object' : 'Show object'}
                    onclick={(e) => {
                      e.stopPropagation()
                      setObjectVisible(child.id, !child.node.visible)
                    }}
                  >
                    {child.node.visible ? 'V' : '-'}
                  </button>
                  <span class="node-kind">{child.type.slice(0, 2).toUpperCase()}</span>
                  <div class="name-cell">
                    <span class="child-indent"></span>
                    {#if editingId === child.id}
                      <input
                        class="name-input"
                        data-rename-id={child.id}
                        bind:value={draftName}
                        onclick={(e) => e.stopPropagation()}
                        onblur={commitRename}
                        onkeydown={onNameKeydown}
                      />
                    {:else}
                      <button
                        type="button"
                        class="node-name"
                        title="Double-click to rename"
                        ondblclick={(e) => {
                          e.stopPropagation()
                          beginRename(child.id, child.name)
                        }}
                      >
                        {child.name}
                      </button>
                    {/if}
                  </div>
                  <span class="node-stats" title={`${child.stats.faces} faces`}>{child.stats.faces}</span>
                  <button
                    type="button"
                    class="icon-toggle lock"
                    class:on={child.node.locked}
                    title={child.node.locked ? 'Unlock object' : 'Lock object'}
                    onclick={(e) => {
                      e.stopPropagation()
                      setObjectLocked(child.id, !child.node.locked)
                    }}
                  >
                    {child.node.locked ? 'L' : '-'}
                  </button>
                </div>
              {/if}
            {/each}
          {/if}
        {:else if obj}
          <div
            class="scene-row"
            class:selected={isSelected(obj.id)}
            class:dragging={draggedId === obj.id}
            class:drop-above={dropTarget?.id === obj.id && dropTarget.position === 'above'}
            class:drop-below={dropTarget?.id === obj.id && dropTarget.position === 'below'}
            draggable={editingId !== obj.id}
            ondragstart={(e) => onDragStart(e, obj.id)}
            ondragover={(e) => onDragOver(e, obj.id, 'object')}
            ondrop={(e) => onDrop(e, obj.id)}
            onclick={() => selectObject(obj.id)}
            onkeydown={(e) => rowKeydown(e, () => selectObject(obj.id))}
            role="option"
            aria-selected={isSelected(obj.id)}
            tabindex="0"
          >
            <span class="drag-handle" title="Drag to reorder">::</span>
            <button
              type="button"
              class="icon-toggle"
              class:off={!obj.node.visible}
              title={obj.node.visible ? 'Hide object' : 'Show object'}
              onclick={(e) => {
                e.stopPropagation()
                setObjectVisible(obj.id, !obj.node.visible)
              }}
            >
              {obj.node.visible ? 'V' : '-'}
            </button>
            <span class="node-kind">{obj.type.slice(0, 2).toUpperCase()}</span>
            <div class="name-cell">
              {#if editingId === obj.id}
                <input
                  class="name-input"
                  data-rename-id={obj.id}
                  bind:value={draftName}
                  onclick={(e) => e.stopPropagation()}
                  onblur={commitRename}
                  onkeydown={onNameKeydown}
                />
              {:else}
                <button
                  type="button"
                  class="node-name"
                  title="Double-click to rename"
                  ondblclick={(e) => {
                    e.stopPropagation()
                    beginRename(obj.id, obj.name)
                  }}
                >
                  {obj.name}
                </button>
              {/if}
            </div>
            <span class="node-stats" title={`${obj.stats.faces} faces`}>{obj.stats.faces}</span>
            <button
              type="button"
              class="icon-toggle lock"
              class:on={obj.node.locked}
              title={obj.node.locked ? 'Unlock object' : 'Lock object'}
              onclick={(e) => {
                e.stopPropagation()
                setObjectLocked(obj.id, !obj.node.locked)
              }}
            >
              {obj.node.locked ? 'L' : '-'}
            </button>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</aside>

<style>
  .outliner {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: #222426;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 6px 5px 10px;
    font-size: 11px;
    font-weight: 650;
    color: #b7c2d0;
    text-transform: uppercase;
    letter-spacing: 0;
    border-bottom: 1px solid #111;
    background: #292b2e;
  }

  .panel-header button {
    height: 20px;
    padding: 0 7px;
    border: 1px solid #354050;
    border-radius: 3px;
    background: #252b33;
    color: #cbd6e3;
    font-size: 10px;
    text-transform: none;
    cursor: pointer;
  }

  .panel-header button:hover {
    border-color: #4d94e8;
    color: #f2f8ff;
  }

  .scene-list {
    padding: 5px 4px;
    overflow-y: auto;
    overflow-x: auto;
    flex: 1;
    min-height: 0;
  }

  .empty {
    margin: 6px 4px;
    font-size: 11px;
    color: #8f9aa8;
  }

  .scene-row {
    position: relative;
    display: grid;
    grid-template-columns: 13px 17px 23px minmax(0, 1fr) 28px 17px;
    align-items: center;
    gap: 3px;
    width: 100%;
    min-height: 25px;
    padding: 2px 3px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #c5cdd8;
    cursor: default;
  }

  .scene-row:hover {
    background: #2d3034;
  }

  .scene-row.selected {
    border-color: #2f73c8;
    background: #173654;
    color: #e8f3ff;
  }

  .scene-row.dragging {
    opacity: 0.45;
  }

  .scene-row.drop-above::before,
  .scene-row.drop-below::after {
    content: '';
    position: absolute;
    left: 3px;
    right: 3px;
    height: 2px;
    border-radius: 2px;
    background: #56a8ff;
    box-shadow: 0 0 4px rgba(86, 168, 255, 0.75);
  }

  .scene-row.drop-above::before {
    top: -2px;
  }

  .scene-row.drop-below::after {
    bottom: -2px;
  }

  .scene-row.drop-inside {
    border-color: #56a8ff;
    background: #153a5c;
  }

  .group-row {
    color: #d9e5f4;
    background: #272b31;
  }

  .child-row {
    padding-left: 8px;
  }

  .drag-handle {
    color: #627083;
    font-size: 10px;
    font-family: 'Cascadia Mono', Consolas, monospace;
    cursor: grab;
    text-align: center;
    user-select: none;
  }

  .scene-row:active .drag-handle {
    cursor: grabbing;
  }

  .icon-toggle,
  .node-name,
  .expander {
    border: none;
    background: transparent;
    color: inherit;
    min-width: 0;
    padding: 0;
  }

  .icon-toggle {
    width: 17px;
    height: 19px;
    color: #91a0b2;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    border-radius: 2px;
  }

  .icon-toggle:hover,
  .icon-toggle.on {
    color: #e8f3ff;
    background: #354050;
  }

  .icon-toggle.off {
    color: #586371;
  }

  .node-kind {
    display: grid;
    place-items: center;
    width: 23px;
    height: 15px;
    border-radius: 2px;
    background: #303846;
    color: #9dccff;
    font-size: 9px;
    font-family: 'Cascadia Mono', Consolas, monospace;
  }

  .group-kind {
    color: #ffd47a;
    background: #433928;
  }

  .name-cell {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 2px;
  }

  .expander {
    width: 12px;
    height: 17px;
    flex: 0 0 auto;
    color: #9aa8b8;
    cursor: pointer;
    font-size: 11px;
  }

  .child-indent {
    width: 8px;
    height: 1px;
    flex: 0 0 auto;
    background: #46515e;
  }

  .node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    text-align: left;
    cursor: text;
  }

  .name-input {
    min-width: 0;
    width: 100%;
    height: 19px;
    padding: 0 4px;
    border: 1px solid #4d94e8;
    border-radius: 2px;
    outline: none;
    background: #111820;
    color: #f2f8ff;
    font-size: 11px;
  }

  .node-stats {
    color: #a4afbd;
    font-size: 10px;
    font-family: 'Cascadia Mono', Consolas, monospace;
    text-align: right;
  }
</style>
