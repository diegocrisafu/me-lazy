import test from "node:test";
import assert from "node:assert/strict";
import { cloneLayout, parseLayout, PRESETS, snap } from "../src/engine/room.ts";
import {
  patchLayout,
  readSavedLayout,
  saveLayout,
  updateLayoutHistory,
  type LayoutHistory,
} from "../src/layoutState.ts";
import {
  commitNumberDraft,
  parseNumberDraft,
  type NumberDraft,
} from "../src/components/NumberInput.tsx";

test("repeated keyboard movement stays bounded and survives saving/reloading", () => {
  for (const preset of Object.values(PRESETS)) {
    let layout = cloneLayout(preset);
    const id = layout.pieces[0].id;
    for (let i = 0; i < 300; i++) {
      const p = layout.pieces[0];
      layout = patchLayout(layout, id, { x: p.x - 0.25, z: p.z + 0.25 });
    }
    assert.equal(layout.pieces[0].x, -4);
    assert.equal(layout.pieces[0].z, layout.depth + 4);
    let stored = "";
    assert.equal(
      saveLayout(
        (raw) => {
          stored = raw;
        },
        layout,
        null,
      ),
      "saved",
    );
    assert.deepEqual(parseLayout(stored), layout);
    layout = patchLayout(layout, id, { x: 1e10, z: -1e10 });
    assert.equal(layout.pieces[0].x, layout.width + 4);
    assert.equal(layout.pieces[0].z, -4);
    assert.deepEqual(parseLayout(JSON.stringify(layout)), layout);
  }
});

test("nonfinite movement cannot corrupt a saved piece", () => {
  const layout = cloneLayout(PRESETS.studio);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(
      patchLayout(layout, layout.pieces[0].id, { x: invalid, z: invalid }),
      layout,
    );
  }
});

test("hitting a movement limit makes no extra undo entry", () => {
  let history: LayoutHistory = {
    past: [],
    current: cloneLayout(PRESETS.studio),
    future: [],
  };
  const id = history.current.pieces[0].id;
  history = updateLayoutHistory(history, (layout) =>
    patchLayout(layout, id, { x: -99 }),
  );
  const atLimit = history;
  for (let i = 0; i < 20; i++)
    history = updateLayoutHistory(history, (layout) =>
      patchLayout(layout, id, { x: -4.25 }),
    );
  assert.equal(history, atLimit);
  assert.equal(history.past.length, 1);
});

test("unreadable saved contents are preserved verbatim across attempted autosaves", () => {
  for (const raw of [
    "",
    "{ broken JSON",
    '{"version":2,"name":"Future layout"}',
    JSON.stringify({
      ...PRESETS.studio,
      pieces: [{ ...PRESETS.studio.pieces[0], x: -11 }],
    }),
  ]) {
    let stored = raw;
    let writes = 0;
    const startup = readSavedLayout(() => stored);
    assert.equal(startup.original, raw);
    assert.equal(startup.storageReadable, true);
    const write = (value: string) => {
      writes++;
      stored = value;
    };
    assert.equal(saveLayout(write, startup.layout, startup.original), "paused");
    const edited = patchLayout(startup.layout, startup.layout.pieces[0].id, {
      x: 2.5,
    });
    assert.equal(saveLayout(write, edited, startup.original), "paused");
    assert.equal(stored, raw);
    assert.equal(writes, 0);
    // Only the explicit recovery action clears the original before saving.
    assert.equal(saveLayout(write, cloneLayout(PRESETS.studio), null), "saved");
    assert.equal(writes, 1);
    assert.deepEqual(parseLayout(stored), PRESETS.studio);
  }
});

test("valid, missing, and unavailable browser storage remain distinct", () => {
  const valid = readSavedLayout(() => JSON.stringify(PRESETS.bedroom));
  assert.deepEqual(valid.layout, PRESETS.bedroom);
  assert.equal(valid.original, null);
  assert.equal(readSavedLayout(() => null).storageReadable, true);
  assert.equal(
    readSavedLayout(() => {
      throw new Error("blocked");
    }).storageReadable,
    false,
  );
  assert.equal(
    saveLayout(
      () => {
        throw new Error("quota");
      },
      valid.layout,
      null,
    ),
    "unavailable",
  );
});

test("numeric drafts allow 220 → 120 and create one undo entry on commit", () => {
  let history: LayoutHistory = {
    past: [],
    current: cloneLayout(PRESETS.studio),
    future: [],
  };
  const id = history.current.pieces[0].id;
  let state: NumberDraft = { text: "220", dirty: false, error: null };
  for (const text of ["", "1", "12", "120"]) {
    state = { text, dirty: true, error: null };
    assert.equal(history.current.pieces[0].width, 2.2);
    assert.equal(history.past.length, 0);
  }
  const enter = commitNumberDraft(state, 220, {
    min: 20,
    max: 400,
    unit: "cm",
  });
  assert.equal(enter.value, 120);
  history = updateLayoutHistory(history, (layout) =>
    patchLayout(layout, id, { width: enter.value! / 100 }),
  );
  // Blur can run before the new parent value has rendered: it still must not commit twice.
  const blur = commitNumberDraft(enter.state, 220, {
    min: 20,
    max: 400,
    unit: "cm",
  });
  assert.equal(blur.value, null);
  assert.equal(history.past.length, 1);
  assert.equal(history.current.pieces[0].width, 1.2);
  assert.equal(history.past[0].pieces[0].width, 2.2);
});

test("invalid numeric commits keep the draft and report readable ranges", () => {
  for (const text of ["", "-", ".", "NaN", "Infinity", "0x20", "401", "19"]) {
    const result = commitNumberDraft({ text, dirty: true, error: null }, 220, {
      min: 20,
      max: 400,
      unit: "cm",
    });
    assert.equal(result.value, null);
    assert.equal(result.state.text, text);
    assert.equal(result.state.dirty, true);
    assert.ok(result.state.error);
  }
  assert.equal(
    parseNumberDraft("401", 20, 400, "cm").error,
    "Enter 20–400 cm.",
  );
  assert.equal(parseNumberDraft("", 20, 400).error, "Enter a number.");
});

test("unchanged or snapped numeric commits do not create duplicate changes", () => {
  assert.equal(
    commitNumberDraft({ text: "220.0", dirty: true, error: null }, 220, {
      min: 20,
      max: 400,
    }).value,
    null,
  );
  assert.equal(
    commitNumberDraft({ text: "1.249", dirty: true, error: null }, 1.25, {
      min: -4,
      max: 9.8,
      normalize: snap,
    }).value,
    null,
  );
  assert.equal(
    commitNumberDraft({ text: "1.27", dirty: true, error: null }, 2, {
      min: -4,
      max: 9.8,
      normalize: snap,
    }).value,
    1.25,
  );
  assert.equal(parseNumberDraft(" 3.5 ", 3, 10, "m").value, 3.5);
  assert.equal(parseNumberDraft("2.9", 3, 10, "m").value, null);
  assert.equal(parseNumberDraft("10.1", 3, 10, "m").value, null);
});
