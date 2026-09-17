import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CATALOG, makePiece, corners } from "../src/engine/room.ts";
import { createFurniture, disposeGroup } from "../src/components/furniture.ts";
const near = (a: number, b: number) =>
  assert(Math.abs(a - b) < 1e-5, `${a} is not close to ${b}`);
test("all seven rendered models honour edited width, depth and height", () => {
  for (const item of CATALOG)
    for (const scale of [0.5, 1, 1.5]) {
      const p = {
        ...makePiece(item.kind, item.kind, 2, 3),
        width: item.width * scale,
        depth: item.depth * scale,
        height: item.height * scale,
      };
      const model = createFurniture(p),
        box = new THREE.Box3().setFromObject(model, true),
        size = box.getSize(new THREE.Vector3());
      near(size.x, p.width);
      near(size.y, p.height);
      near(size.z, p.depth);
      near(box.min.y, 0);
      near((box.min.x + box.max.x) / 2, p.x);
      near((box.min.z + box.max.z) / 2, p.z);
      disposeGroup(model);
    }
});
test("rotated models stay inside the geometry engine footprint envelope", () => {
  for (const item of CATALOG)
    for (const rotation of [0, 45, 90, 135, 180, 270]) {
      const p = { ...makePiece(item.kind, item.kind, 2, 3), rotation };
      const model = createFurniture(p),
        box = new THREE.Box3().setFromObject(model, true);
      const poly = corners(p);
      assert(box.min.x >= Math.min(...poly.map((c) => c.x)) - 1e-5);
      assert(box.max.x <= Math.max(...poly.map((c) => c.x)) + 1e-5);
      assert(box.min.z >= Math.min(...poly.map((c) => c.z)) - 1e-5);
      assert(box.max.z <= Math.max(...poly.map((c) => c.z)) + 1e-5);
      disposeGroup(model);
    }
});
test("replacing furniture releases owned GPU geometry and materials exactly once", () => {
  for (const item of CATALOG) {
    const model = createFurniture(makePiece(item.kind, item.kind, 2, 2));
    const owned = new Set<THREE.BufferGeometry | THREE.Material>();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) owned.add(m.geometry);
      if (m.material)
        for (const material of Array.isArray(m.material)
          ? m.material
          : [m.material])
          owned.add(material);
    });
    const counts = new Map<object, number>();
    for (const resource of owned)
      resource.addEventListener("dispose", () =>
        counts.set(resource, (counts.get(resource) || 0) + 1),
      );
    disposeGroup(model);
    for (const resource of owned) assert.equal(counts.get(resource), 1);
  }
});
