import {
  cloneLayout,
  parseLayout,
  PRESETS,
  type Layout,
  type Piece,
} from "./engine/room";

export type LayoutHistory = {
  past: Layout[];
  current: Layout;
  future: Layout[];
};
export type SavedLayout = {
  layout: Layout;
  original: string | null;
  storageReadable: boolean;
};

export function readSavedLayout(read: () => string | null): SavedLayout {
  let original: string | null;
  try {
    original = read();
  } catch {
    return {
      layout: cloneLayout(PRESETS.studio),
      original: null,
      storageReadable: false,
    };
  }
  if (original !== null) {
    try {
      return {
        layout: parseLayout(original),
        original: null,
        storageReadable: true,
      };
    } catch {
      return {
        layout: cloneLayout(PRESETS.studio),
        original,
        storageReadable: true,
      };
    }
  }
  return {
    layout: cloneLayout(PRESETS.studio),
    original: null,
    storageReadable: true,
  };
}

export function saveLayout(
  write: (serialized: string) => void,
  layout: Layout,
  original: string | null,
): "saved" | "paused" | "unavailable" {
  if (original !== null) return "paused";
  try {
    write(JSON.stringify(layout));
    return "saved";
  } catch {
    return "unavailable";
  }
}

export function updateLayoutHistory(
  history: LayoutHistory,
  change: (layout: Layout) => Layout,
): LayoutHistory {
  const next = change(cloneLayout(history.current));
  if (JSON.stringify(next) === JSON.stringify(history.current)) return history;
  return {
    past: [...history.past, history.current].slice(-50),
    current: next,
    future: [],
  };
}

export function patchLayout(
  layout: Layout,
  id: string,
  changes: Partial<Piece>,
): Layout {
  const bounded = (value: number, side: number, previous: number) =>
    Number.isFinite(value) ? Math.min(side + 4, Math.max(-4, value)) : previous;
  return {
    ...layout,
    pieces: layout.pieces.map((piece) => {
      if (piece.id !== id) return piece;
      const next = { ...piece, ...changes };
      if (changes.x !== undefined)
        next.x = bounded(changes.x, layout.width, piece.x);
      if (changes.z !== undefined)
        next.z = bounded(changes.z, layout.depth, piece.z);
      return next;
    }),
  };
}
