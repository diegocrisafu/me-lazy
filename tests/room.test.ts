import test from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS,
  cloneLayout,
  checkLayout,
  makePiece,
  overlap,
  parseLayout,
  occupiedArea,
  pointInside,
  doorZone,
  snap,
} from "../src/engine/room.ts";
test("all starter rooms are free from collisions and door obstructions", () => {
  for (const room of Object.values(PRESETS))
    assert.deepEqual(checkLayout(room), [], room.name);
});
test("SAT catches a rotated overlap and excludes merely touching edges", () => {
  const a = makePiece("sofa", "a", 2, 2),
    b = makePiece("chair", "b", 2, 2);
  assert.equal(overlap(a, { ...b, rotation: 45 }), true);
  assert.equal(overlap(a, { ...b, x: 3.5 }), false);
});
test("rotation changes occupied bounds", () => {
  const p = makePiece("sofa", "x", 0.6, 2);
  const l = { ...cloneLayout(PRESETS.studio), pieces: [p] };
  assert(checkLayout(l).some((i) => i.type === "outside"));
  p.rotation = 90;
  assert(!checkLayout(l).some((i) => i.type === "outside"));
});
test("door obstruction is detected independently of overlap", () => {
  const l = cloneLayout(PRESETS.studio);
  l.pieces = [{ ...makePiece("chair", "x", doorZone(l).x, l.depth - 0.5) }];
  assert.deepEqual(
    checkLayout(l).map((i) => i.type),
    ["door"],
  );
});
test("overlap reports each pair once", () => {
  const l = cloneLayout(PRESETS.studio);
  l.pieces = [makePiece("chair", "a", 2, 2), makePiece("chair", "b", 2, 2)];
  assert.equal(checkLayout(l).length, 1);
});
test("JSON round-trip preserves layouts without prototypes", () => {
  assert.deepEqual(parseLayout(JSON.stringify(PRESETS.studio)), PRESETS.studio);
});
test("rejects malformed, huge, nonfinite and duplicate input", () => {
  for (const data of [
    {},
    { ...PRESETS.studio, width: 99 },
    {
      ...PRESETS.studio,
      pieces: [PRESETS.studio.pieces[0], PRESETS.studio.pieces[0]],
    },
    { ...PRESETS.studio, pieces: [{ ...PRESETS.studio.pieces[0], x: null }] },
  ])
    assert.throws(() => parseLayout(JSON.stringify(data)));
  assert.throws(() => parseLayout("x".repeat(100001)));
});
test("occupied area is a union, not double-counted footprints", () => {
  const l = cloneLayout(PRESETS.studio);
  l.pieces = [makePiece("chair", "a", 2, 2)];
  const area = occupiedArea(l);
  l.pieces.push(makePiece("chair", "b", 2, 2));
  assert.equal(occupiedArea(l), area);
  assert(area > 0 && area < 1);
});
test("point containment rotates into furniture coordinates", () => {
  const p = { ...makePiece("sofa", "a", 2, 2), rotation: 90 };
  assert(pointInside({ x: 2, z: 3 }, p));
  assert(!pointInside({ x: 3, z: 2 }, p));
});
test("grid snapping is 5 cm and clones do not mutate originals", () => {
  assert.equal(snap(1.234), 1.25);
  const l = cloneLayout(PRESETS.studio);
  l.pieces[0].x = 9;
  assert.notEqual(l.pieces[0].x, PRESETS.studio.pieces[0].x);
});
