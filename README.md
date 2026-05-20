# Low Poly 3D CAD

A browser-based low-poly modeling app built with **Vite**, **Svelte 5**, **Threlte**, and **Three.js**.

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Features

- **Quad viewport** — Top, perspective, front, and side views
- **Primitives** — Box, low-poly sphere, cylinder, cone, torus, plane
- **Edit modes** — Object, vertex, edge, face
- **Tools** — Select, grab, extrude face, bevel, subdivide
- **Shading** — Solid, wireframe, MatCap normals
- **Export** — OBJ and JSON scene files

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `1`–`4` | Object / Vertex / Edge / Face mode |
| `G` | Grab tool |
| `S` | Select tool |
| `E` | Extrude face |
| `B` | Bevel |
| `Delete` | Delete selection |
| `Ctrl+D` | Duplicate |
| `Ctrl+A` | Select all (sub-elements) |
| `Ctrl+N` | New scene |
| `Ctrl+S` | Save scene (`.json`) |
| `Ctrl+O` | Open scene |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Shift+W` | Toggle wireframe shading |

## Properties panel

With an object selected in **Object mode**, use the right panel to edit position, rotation (degrees), and scale numerically.

## Transform gizmo

In **Object mode** with the **Select** tool, a 3D gizmo appears on the selected mesh:

- Drag arrows / rings / boxes to move, rotate, or scale
- Gizmo follows the **active viewport** (click a quadrant first)
- Toolbar **Gizmo** section: Move / Rotate / Scale
- Keyboard: `T` move, `R` rotate, `L` scale
- Gizmo transforms are undoable (`Ctrl+Z`)

## Viewport controls

- **LMB** — Select / tool action
- **MMB drag** — Pan
- **Scroll** — Zoom
- **RMB drag** — Orbit (perspective view only)
- **Alt + LMB** — Pan
