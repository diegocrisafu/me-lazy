# RoomFit architecture

`src/engine/room.ts` is a pure geometry model. Dimensions and positions use metres, rotations use degrees, and drag snapping uses a 5 cm grid. Validation limits the room to 3–10 m per side and at most 40 pieces. Furniture dimensions have explicit bounds; duplicate IDs, unsupported kinds and invalid colours are rejected on import.

`App.tsx` owns immutable current, past and future layouts. A completed move is one undo step. The current layout is persisted to browser storage; export provides a portable backup. Pinning clones the layout so later changes cannot alter a comparison baseline.

`RoomScene.tsx` owns Three.js rendering and pointer-to-world conversion. Furniture visuals use the same dimensions as the geometry model. `PlanView.tsx` provides a directly editable SVG view and a WebGL fallback. The inspector provides keyboard-accessible controls for the same operations.

## Algorithms

Collision: separating-axis tests over two oriented rectangles, with touching edges treated as non-overlap. Every pair is checked once. Room bounds test all four corners. Door clearance is an explicit 1.05 × 0.9 m rectangle at the front of the room.

Floor coverage: sample the union of footprints on an 8 cm grid. The reported percentage counts each occupied sample once. It is approximate and does not claim navigability or regulatory compliance.

## Verification

Tests cover starter scenes, rotation, edge contact, door obstruction, duplicate pair reporting, serialisation, malformed imports, union coverage, coordinate transforms and immutable clones. The benchmark records actual timings on the machine that runs it, including CPU and runtime; it is not a browser performance guarantee.
