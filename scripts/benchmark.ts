import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import os from "node:os";
import {
  checkLayout,
  cloneLayout,
  PRESETS,
  makePiece,
  occupiedArea,
} from "../src/engine/room.ts";
const layout = cloneLayout(PRESETS.studio);
layout.width = 10;
layout.depth = 10;
layout.pieces = Array.from({ length: 40 }, (_, i) =>
  makePiece(
    "chair",
    `bench-${i}`,
    0.6 + (i % 8) * 1.2,
    0.6 + Math.floor(i / 8) * 1.3,
  ),
);
const timing = (fn: () => unknown, n: number) => {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    iterations: n,
    medianMs: +times[Math.floor(n / 2)].toFixed(3),
    p95Ms: +times[Math.floor(n * 0.95)].toFixed(3),
  };
};
const report = {
  measuredAt: new Date().toISOString(),
  runtime: process.version,
  cpu: os.cpus()[0].model,
  scenario: "40 chairs in a 10 × 10 m room",
  collision: timing(() => checkLayout(layout), 50),
  floorCoverage: timing(() => occupiedArea(layout), 30),
};
writeFileSync("docs/benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
