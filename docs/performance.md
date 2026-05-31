# Newt Node Performance Notes

This note captures the current startup and bundle-loading shape so optimization work stays measurable. Update it when a pass deliberately changes startup loading, code splitting, or heavy runtime ownership.

## How To Measure

Run a production build, then summarize the emitted `dist/` assets. Use the platform-native npm command so Windows and macOS checks measure the same build.

Windows PowerShell:

```powershell
npm.cmd run build
npm.cmd run bundle:report
```

macOS/Linux:

```bash
npm run build
npm run bundle:report
```

`bundle:report` classifies assets referenced by `dist/index.html` as the initial shell and everything else as lazy/generated. It reports raw and gzip sizes.

With the dev server running, smoke the browser shell and API health route:

Windows PowerShell:

```powershell
npm.cmd run smoke:app
```

macOS/Linux:

```bash
npm run smoke:app
```

The smoke harness fetches the client HTML, its referenced module/style assets, and `/api/health`. Override `NEWT_SMOKE_CLIENT_URL` or `NEWT_SMOKE_API_URL` when testing a non-default port.

## Current Baseline

Measured after the video runner helper extraction pass.

| Area | Current behavior |
| --- | --- |
| Initial shell | `src/main.jsx`, core React, shared vendor, icons, and global CSS are referenced by `dist/index.html`. |
| Node editor | `src/NodeEditor.jsx` is loaded through `React.lazy` after the user enters the node workspace. |
| Stats dashboard | `src/StatsDashboard.jsx` is loaded through `React.lazy`. |
| Color ID matte controls | `src/components/ColorIdMatteControls.jsx` is loaded only when the relevant utility controls render. |
| 3D result viewer | `src/components/Model3DViewer.jsx` is loaded only when a 3D preview/result renders. |
| Three.js runtime | `vendor-three` is generated as an async chunk from `src/threeRuntime.js`; it is not referenced by `dist/index.html`. |

Recent production build summary:

| Asset | Role | Size | Gzip |
| --- | --- | ---: | ---: |
| `index.html` | document | 0.73 kB | 0.37 kB |
| `assets/index-*.js` | entry script | 24.24 kB | 7.95 kB |
| `assets/index-*.css` | entry style | 14.43 kB | 3.68 kB |
| `assets/vendor-*.js` | modulepreload | 3.53 kB | 1.54 kB |
| `assets/vendor-react-*.js` | modulepreload | 184.30 kB | 57.63 kB |
| `assets/vendor-icons-*.js` | modulepreload | 11.48 kB | 3.96 kB |
| `assets/NodeEditor-*.js` | lazy editor chunk | 290.43 kB | 79.55 kB |
| `assets/NodeEditor-*.css` | lazy editor style | 57.34 kB | 10.47 kB |
| `assets/Model3DViewer-*.js` | lazy 3D viewer chunk | 3.53 kB | 1.64 kB |
| `assets/ColorIdMatteControls-*.js` | lazy utility chunk | 12.76 kB | 3.21 kB |
| `assets/StatsDashboard-*.js` | lazy stats chunk | 18.18 kB | 6.26 kB |
| `assets/vendor-three-*.js` | lazy Three.js runtime | 761.25 kB | 198.57 kB |

## Guardrails

- Do not statically import `three`, GLTF loaders, or viewer-only Three UI into `src/main.jsx` or common preview modules.
- Keep heavy node controls behind `React.lazy` when they are not common to normal canvas startup.
- Use focused components for new heavy UI surfaces so future lazy boundaries are easy to place.
- Treat bundle-size changes as a signal to inspect loading behavior, not as the only performance measure.
