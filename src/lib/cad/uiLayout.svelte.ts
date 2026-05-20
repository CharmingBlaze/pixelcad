export const uiLayout = $state({
  sidebarsVisible: true,
})

export function toggleSidebars() {
  uiLayout.sidebarsVisible = !uiLayout.sidebarsVisible
}

export function setSidebarsVisible(visible: boolean) {
  uiLayout.sidebarsVisible = visible
}
