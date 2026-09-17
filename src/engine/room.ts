export type Kind =
  "sofa" | "chair" | "table" | "desk" | "shelf" | "plant" | "bed";
export type Piece = {
  id: string;
  kind: Kind;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: string;
};
export type Layout = {
  version: 1;
  name: string;
  width: number;
  depth: number;
  pieces: Piece[];
};
export type Point = { x: number; z: number };
export type Issue = {
  type: "overlap" | "outside" | "door";
  ids: string[];
  message: string;
};
export const CATALOG: {
  kind: Kind;
  name: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  description: string;
}[] = [
  {
    kind: "sofa",
    name: "Sunday sofa",
    width: 2.2,
    depth: 0.9,
    height: 0.78,
    color: "#b97556",
    description: "A generous two-seater",
  },
  {
    kind: "chair",
    name: "Arc lounge chair",
    width: 0.8,
    depth: 0.85,
    height: 0.8,
    color: "#788271",
    description: "A little corner of calm",
  },
  {
    kind: "table",
    name: "Pebble table",
    width: 1.05,
    depth: 0.65,
    height: 0.38,
    color: "#a6805a",
    description: "Low, rounded oak",
  },
  {
    kind: "desk",
    name: "Workday desk",
    width: 1.4,
    depth: 0.65,
    height: 0.76,
    color: "#b99b77",
    description: "Room for a good idea",
  },
  {
    kind: "shelf",
    name: "Open bookshelf",
    width: 1.25,
    depth: 0.35,
    height: 1.7,
    color: "#a87d54",
    description: "Your objects, on display",
  },
  {
    kind: "plant",
    name: "Fiddle-leaf fig",
    width: 0.5,
    depth: 0.5,
    height: 1.55,
    color: "#547259",
    description: "Something living",
  },
  {
    kind: "bed",
    name: "Queen bed",
    width: 1.6,
    depth: 2.1,
    height: 0.55,
    color: "#b9b8a3",
    description: "Space to switch off",
  },
];
export function makePiece(kind: Kind, id: string, x: number, z: number): Piece {
  const { description: _, ...item } = CATALOG.find((c) => c.kind === kind)!;
  return { ...item, id, x, z, rotation: 0 };
}
export const PRESETS: Record<string, Layout> = {
  studio: {
    version: 1,
    name: "The Sunday studio",
    width: 5.8,
    depth: 4.6,
    pieces: [
      makePiece("sofa", "sofa", 1.7, 0.7),
      { ...makePiece("chair", "chair", 3.52, 1.8), rotation: 270 },
      makePiece("table", "table", 1.95, 2.05),
      makePiece("desk", "desk", 0.8, 3.32),
      { ...makePiece("shelf", "shelf", 4.7, 0.3) },
      makePiece("plant", "plant", 3.2, 0.4),
    ],
  },
  bedroom: {
    version: 1,
    name: "A quieter corner",
    width: 5.2,
    depth: 4.6,
    pieces: [
      makePiece("bed", "bed", 1.5, 1.45),
      makePiece("desk", "desk", 4.3, 1.05),
      makePiece("chair", "chair", 4.15, 3),
      makePiece("shelf", "shelf", 1.35, 4.3),
      makePiece("plant", "plant", 4.85, 0.35),
    ],
  },
  compact: {
    version: 1,
    name: "Small space, big ideas",
    width: 4.4,
    depth: 3.8,
    pieces: [
      makePiece("sofa", "sofa", 1.5, 0.62),
      makePiece("table", "table", 1.5, 1.9),
      makePiece("desk", "desk", 3.45, 1.75),
      makePiece("plant", "plant", 3.95, 0.35),
    ],
  },
};
export const cloneLayout = (l: Layout): Layout => structuredClone(l);
export const snap = (n: number) => Math.round(n * 20) / 20;
export function corners(p: Piece): Point[] {
  const r = (p.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: p.x + ((a * p.width) / 2) * c - ((b * p.depth) / 2) * s,
    z: p.z + ((a * p.width) / 2) * s + ((b * p.depth) / 2) * c,
  }));
}
export function overlap(a: Piece, b: Piece, padding = 0): boolean {
  const pa = corners({
      ...a,
      width: a.width + padding * 2,
      depth: a.depth + padding * 2,
    }),
    pb = corners(b);
  for (const poly of [pa, pb])
    for (let i = 0; i < 4; i++) {
      const q = poly[i],
        r = poly[(i + 1) % 4],
        axis = { x: -(r.z - q.z), z: r.x - q.x };
      const aa = pa.map((v) => v.x * axis.x + v.z * axis.z),
        bb = pb.map((v) => v.x * axis.x + v.z * axis.z);
      if (
        Math.max(...aa) <= Math.min(...bb) + 1e-7 ||
        Math.max(...bb) <= Math.min(...aa) + 1e-7
      )
        return false;
    }
  return true;
}
export const doorZone = (l: Layout): Piece => ({
  id: "door",
  kind: "table",
  name: "Door clearance",
  x: l.width * 0.66,
  z: l.depth - 0.45,
  width: 1.05,
  depth: 0.9,
  height: 0,
  rotation: 0,
  color: "",
});
export function checkLayout(l: Layout): Issue[] {
  const issues: Issue[] = [];
  for (const p of l.pieces) {
    if (
      corners(p).some(
        (c) =>
          c.x < -0.001 ||
          c.z < -0.001 ||
          c.x > l.width + 0.001 ||
          c.z > l.depth + 0.001,
      )
    )
      issues.push({
        type: "outside",
        ids: [p.id],
        message: `${p.name} crosses a wall.`,
      });
    if (overlap(p, doorZone(l)))
      issues.push({
        type: "door",
        ids: [p.id],
        message: `${p.name} blocks the doorway's 90 cm clearance zone.`,
      });
  }
  for (let i = 0; i < l.pieces.length; i++)
    for (let j = i + 1; j < l.pieces.length; j++)
      if (overlap(l.pieces[i], l.pieces[j]))
        issues.push({
          type: "overlap",
          ids: [l.pieces[i].id, l.pieces[j].id],
          message: `${l.pieces[i].name} overlaps ${l.pieces[j].name.toLowerCase()}.`,
        });
  return issues;
}
export function occupiedArea(l: Layout): number {
  let n = 0,
    total = 0;
  const step = 0.08;
  for (let x = step / 2; x < l.width; x += step)
    for (let z = step / 2; z < l.depth; z += step) {
      total++;
      if (l.pieces.some((p) => pointInside({ x, z }, p))) n++;
    }
  return total ? n / total : 0;
}
export function pointInside(v: Point, p: Piece) {
  const r = (-p.rotation * Math.PI) / 180,
    dx = v.x - p.x,
    dz = v.z - p.z,
    x = dx * Math.cos(r) - dz * Math.sin(r),
    z = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(x) <= p.width / 2 && Math.abs(z) <= p.depth / 2;
}
export function parseLayout(raw: string): Layout {
  if (raw.length > 100000)
    throw new Error(
      "This layout is too large. Choose a RoomFit JSON file under 100 KB.",
    );
  const l = JSON.parse(raw);
  const finite = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  if (
    l?.version !== 1 ||
    typeof l.name !== "string" ||
    l.name.length > 80 ||
    !finite(l.width, 3, 10) ||
    !finite(l.depth, 3, 10) ||
    !Array.isArray(l.pieces) ||
    l.pieces.length > 40
  )
    throw new Error("This file is not a supported RoomFit layout.");
  const ids = new Set();
  for (const p of l.pieces) {
    if (
      !p ||
      typeof p.id !== "string" ||
      p.id.length > 100 ||
      ids.has(p.id) ||
      !CATALOG.some((c) => c.kind === p.kind) ||
      typeof p.name !== "string" ||
      p.name.length > 80 ||
      !finite(p.x, -10, 20) ||
      !finite(p.z, -10, 20) ||
      !finite(p.width, 0.2, 4) ||
      !finite(p.depth, 0.2, 4) ||
      !finite(p.height, 0.1, 3) ||
      !finite(p.rotation, 0, 359) ||
      typeof p.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(p.color)
    )
      throw new Error(
        "One of the furniture items has invalid dimensions or properties.",
      );
    ids.add(p.id);
  }
  return {
    version: 1,
    name: l.name,
    width: l.width,
    depth: l.depth,
    pieces: l.pieces.map((p: Piece) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      x: p.x,
      z: p.z,
      width: p.width,
      depth: p.depth,
      height: p.height,
      rotation: p.rotation,
      color: p.color,
    })),
  };
}
export const formatM = (m: number) => `${Math.round(m * 100)} cm`;
