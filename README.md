# RoomFit

**Move furniture in 3D. Check the fit before you commit.**

A room planner with a fully interactive miniature interior, a measured floor plan, and geometric fit checks. Designed and built by **Diego Crisafulli**.

[Open the studio](https://diegocrisafu.github.io/) · [GitHub Pages mirror](https://diegocrisafu.github.io/me-lazy/)

## Try it

Pick a piece and drag it across the room. Change its width or depth, rotate it, and see overlaps or doorway obstructions appear. Pin a layout, try a different arrangement, then compare the two. Everything runs in your browser.

- Three furnished starter rooms; seven editable furniture types.
- Real Three.js rendering, orbit controls, shadows, direct furniture dragging, and a 2D fallback.
- Oriented-footprint collision detection, boundary checks, and a 90 cm doorway clearance zone.
- Undo/redo, local persistence, portable JSON import/export, and pinned layout comparison.
- Keyboard editing, responsive layouts, and reduced-motion support.

## Run locally

Node 22.12+ and npm:

```sh
npm ci
npm run dev
npm test
npm run build
npm run benchmark
```

## How it works

The shared layout stores furniture dimensions and positions in metres. Both views consume the same model. Separating-axis tests detect intersections between oriented rectangular footprints. A sampled footprint union estimates occupied floor area without double counting overlaps. Browser storage is schema-validated before use.

The 3D renderer loads separately from the interface. It renders on interaction instead of keeping an idle animation loop running. Geometry and materials are disposed when scenes are replaced. The geometry engine is independent of React and is covered by invariant and input-validation tests.

See [architecture](docs/architecture.md) and [measured benchmark](docs/benchmark.json).

## Scope

RoomFit is a planning aid. Furniture uses rectangular footprint envelopes, including round or irregular pieces. It does not certify accessibility, building-code compliance, or whether an object can be carried through a door. Always measure the real room. Floor coverage is an estimate sampled at 8 cm resolution.

The current layout is saved on this device; pinned comparisons and undo history last for the session. No accounts, analytics, external API calls, or server uploads are required. Export a JSON file for a portable backup.

## Deployment

`npm run build` produces a portable static `dist/` with relative asset URLs. It works at a hostname root or under a subdirectory. `npm run deploy` verifies and publishes both the standalone GitHub Pages site and the repository mirror. Source lives on `main`; the existing `gh-pages` branch only contains the generated deployment.

## Author and licence

Diego Crisafulli. MIT licence. Third-party dependency notices are available in `public/third-party-licenses.txt`.
