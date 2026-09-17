import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  CodeXml,
  Expand,
  Grid2X2,
  Layers,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Undo2,
  Upload,
  X,
  AlertTriangle,
  Box,
} from "lucide-react";
import {
  PRESETS,
  cloneLayout,
  checkLayout,
  occupiedArea,
  makePiece,
  parseLayout,
  snap,
  type Layout,
  type Kind,
  type Piece,
} from "./engine/room";
import PlanView from "./components/PlanView";
import FurniturePanel from "./components/FurniturePanel";
import Inspector from "./components/Inspector";
import NumberInput from "./components/NumberInput";
import {
  patchLayout,
  readSavedLayout,
  saveLayout,
  updateLayoutHistory,
  type LayoutHistory,
} from "./layoutState";
const RoomScene = lazy(() => import("./components/RoomScene"));
const KEY = "roomfit.layout.v1";
function initial() {
  return readSavedLayout(() => localStorage.getItem(KEY));
}
function downloadJSON(contents: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [startup] = useState(initial);
  const [original, setOriginal] = useState(startup.original);
  const [history, setHistory] = useState<LayoutHistory>(() => ({
    past: [],
    current: startup.layout,
    future: [],
  }));
  const layout = history.current;
  const [selected, setSelected] = useState<string | null>("sofa");
  const [mode, setMode] = useState<"3d" | "plan">("3d");
  const [catalog, setCatalog] = useState(false);
  const [toast, setToast] = useState("");
  const [home, setHome] = useState(0);
  const [preset, setPreset] = useState(false);
  const [pin, setPin] = useState<Layout | null>(null);
  const [compare, setCompare] = useState(false);
  const [saved, setSaved] = useState(
    startup.storageReadable && startup.original === null,
  );
  const file = useRef<HTMLInputElement>(null);
  const comparison = useRef<HTMLElement>(null);
  const piece = layout.pieces.find((p) => p.id === selected);
  const issues = useMemo(() => checkLayout(layout), [layout]);
  const used = useMemo(() => occupiedArea(layout), [layout]);
  const update = (fn: (l: Layout) => Layout) =>
    setHistory((h) => updateLayoutHistory(h, fn));
  const patch = (id: string, data: Partial<Piece>) =>
    update((l) => patchLayout(l, id, data));
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            current: h.past[h.past.length - 1],
            future: [h.current, ...h.future],
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.current],
            current: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  useEffect(() => {
    if (!startup.storageReadable) {
      setSaved(false);
      return;
    }
    setSaved(
      saveLayout(
        (contents) => localStorage.setItem(KEY, contents),
        layout,
        original,
      ) === "saved",
    );
  }, [layout, original, startup.storageReadable]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (
        piece &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
        !(e.target as HTMLElement).closest("button,a")
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        patch(piece.id, {
          x: snap(
            piece.x +
              (e.key === "ArrowLeft"
                ? -step
                : e.key === "ArrowRight"
                  ? step
                  : 0),
          ),
          z: snap(
            piece.z +
              (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0),
          ),
        });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [piece]);
  const add = (kind: Kind) => {
    if (layout.pieces.length >= 40) {
      setToast(
        "This room supports up to 40 pieces. Remove a piece to add another.",
      );
      return;
    }
    const p = makePiece(
      kind,
      crypto.randomUUID(),
      snap(layout.width / 2),
      snap(layout.depth / 2),
    );
    update((l) => ({ ...l, pieces: [...l.pieces, p] }));
    setSelected(p.id);
    setToast(`${p.name} added. Drag it into place.`);
  };
  const download = () => {
    downloadJSON(JSON.stringify(layout, null, 2), "roomfit-layout.json");
    setToast("Layout exported. Import it on another device to keep planning.");
  };
  const startFresh = () => {
    const fresh = cloneLayout(PRESETS.studio);
    setHistory({ past: [], current: fresh, future: [] });
    setSelected(fresh.pieces[0]?.id ?? null);
    setPin(null);
    setCompare(false);
    setPreset(false);
    setHome((h) => h + 1);
    setOriginal(null);
    setToast("Started a fresh room.");
  };
  const loadPreset = (key: string) => {
    update(() => cloneLayout(PRESETS[key]));
    setSelected(PRESETS[key].pieces[0].id);
    setPreset(false);
    setHome((h) => h + 1);
    setToast("Room loaded. Undo brings back your previous layout.");
  };
  const importLayout: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 100000) throw new Error("Choose a layout under 100 KB.");
      const l = parseLayout(await f.text());
      update(() => l);
      setSelected(l.pieces[0]?.id || null);
      setToast("Your layout is ready.");
    } catch (err) {
      setToast(
        err instanceof Error ? err.message : "Could not read this file.",
      );
    }
    e.target.value = "";
  };
  return (
    <>
      <a className="skip-link" href="#studio">
        Skip to room planner
      </a>
      <header id="top" className="site-header">
        <a className="brand" href="#top" aria-label="RoomFit studio">
          <Box size={26} strokeWidth={1.5} />
          <span>
            roomfit<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a className="active" href="#studio">
            The studio
          </a>
          <a href="#how-it-works">How it works</a>
          <a
            href="https://github.com/diegocrisafu/me-lazy"
            target="_blank"
            rel="noreferrer"
            className="source-link"
          >
            <CodeXml size={16} /> Source
          </a>
        </nav>
        <span className="byline">
          A project by{" "}
          <a href="mailto:diego.crisafu@gmail.com">Diego Crisafulli</a>
        </span>
      </header>
      <main>
        <section className="intro">
          <div>
            <h1>Your room. A better fit.</h1>
            <p>Move furniture in 3D. Check the fit before you commit.</p>
          </div>
          <div className="intro-actions">
            <span className="save-status">
              <span className={saved ? "status-dot" : "status-dot warning"} />
              {original !== null
                ? "Saving paused · original preserved"
                : saved
                  ? "Saved on this device"
                  : "Browser storage unavailable"}
            </span>
            <button className="button secondary" onClick={download}>
              <ArrowDownToLine size={16} /> Export layout
            </button>
          </div>
        </section>
        {original !== null && (
          <section
            className="layout-recovery"
            aria-label="Recover saved layout"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              padding: "14px 16px",
              border: "1px solid #d6c5a8",
              borderRadius: 8,
              background: "#faf1df",
              color: "#56442e",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <p style={{ flex: "1 1 260px" }}>
              Your saved layout couldn’t be opened. The original is preserved
              and saving is paused. Download it before starting fresh.
            </p>
            <button
              className="button secondary"
              onClick={() =>
                downloadJSON(original, "roomfit-original-layout.json")
              }
            >
              <ArrowDownToLine size={15} />
              Download original
            </button>
            <button className="button secondary" onClick={startFresh}>
              Start fresh
            </button>
          </section>
        )}
        <section id="studio" className="studio" aria-label="Room planner">
          <FurniturePanel
            pieces={layout.pieces}
            selected={selected}
            catalog={catalog}
            issues={issues}
            fileRef={file}
            onCatalogChange={setCatalog}
            onSelect={setSelected}
            onAdd={add}
            onImport={importLayout}
          />
          <div className="scene-column">
            <div className="scene-toolbar">
              <div className="preset-wrap">
                <button
                  className="room-name"
                  onClick={() => setPreset(!preset)}
                  aria-expanded={preset}
                >
                  {layout.name}
                  <ChevronDown size={15} />
                </button>
                {preset && (
                  <div className="preset-menu">
                    {Object.entries(PRESETS).map(([key, l]) => (
                      <button key={key} onClick={() => loadPreset(key)}>
                        <span>{l.name}</span>
                        <small>
                          {l.width} × {l.depth} m
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                <span className="room-dimensions">
                  {layout.width.toFixed(1)} × {layout.depth.toFixed(1)} m
                </span>
              </div>
              <div className="segmented view-tabs" aria-label="View mode">
                <button
                  className={mode === "3d" ? "chosen" : ""}
                  onClick={() => setMode("3d")}
                  aria-pressed={mode === "3d"}
                >
                  <Box size={14} />
                  3D
                </button>
                <button
                  className={mode === "plan" ? "chosen" : ""}
                  onClick={() => setMode("plan")}
                  aria-pressed={mode === "plan"}
                >
                  <Grid2X2 size={14} />
                  Plan
                </button>
              </div>
            </div>
            <div className="scene-stage">
              {mode === "3d" ? (
                <Suspense
                  fallback={
                    <div className="scene-loading">
                      <Box size={36} />
                      <p>Setting out your furniture…</p>
                    </div>
                  }
                >
                  <RoomScene
                    layout={layout}
                    selected={selected}
                    onSelect={setSelected}
                    onMove={(id, x, z) => patch(id, { x, z })}
                    onFallback={() => {
                      setMode("plan");
                      setToast(
                        "3D is unavailable in this browser. The interactive floor plan is ready.",
                      );
                    }}
                    resetView={home}
                  />
                </Suspense>
              ) : (
                <PlanView
                  layout={layout}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={(id, x, z) => patch(id, { x, z })}
                />
              )}
              <div className="scene-tag">
                <span className="tiny-dot" /> Illustrative room · set your own
                measurements
              </div>
              <div className="scene-tools">
                <button
                  title="Undo (⌘Z)"
                  aria-label="Undo last change"
                  disabled={!history.past.length}
                  onClick={undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  title="Redo (⌘⇧Z)"
                  aria-label="Redo last change"
                  disabled={!history.future.length}
                  onClick={redo}
                >
                  <Redo2 size={17} />
                </button>
                <span />
                <button
                  title="Reset camera"
                  aria-label="Reset camera"
                  onClick={() => setHome((h) => h + 1)}
                >
                  <Expand size={17} />
                </button>
              </div>
              <div className="scene-hint">
                <Move size={14} />
                <span>
                  {mode === "3d"
                    ? "Drag a piece to move it · drag the floor to orbit"
                    : "Drag a piece to move it · dimensions are in metres"}
                </span>
              </div>
            </div>
            <div
              className={`fit-strip ${issues.length ? "has-issues" : ""}`}
              role="status"
              aria-live="polite"
            >
              <div className="fit-strip-icon">
                {issues.length ? (
                  <AlertTriangle size={19} />
                ) : (
                  <CheckCheck size={19} />
                )}
              </div>
              <div>
                <strong>
                  {issues.length
                    ? `${issues.length} ${issues.length === 1 ? "thing" : "things"} to adjust`
                    : "Looking good. Everything fits."}
                </strong>
                <span>
                  {issues.length
                    ? issues[0].message
                    : "No overlaps. Clear doorway. All pieces inside the room."}
                </span>
              </div>
              <span className="floor-area">
                {(layout.width * layout.depth).toFixed(1)} m²
              </span>
            </div>
          </div>
          <Inspector
            key={piece?.id ?? "no-selection"}
            piece={piece}
            layout={layout}
            issues={issues}
            onChange={patch}
            onRemove={(id) => {
              update((l) => ({
                ...l,
                pieces: l.pieces.filter((p) => p.id !== id),
              }));
              setSelected(null);
            }}
          />
        </section>
        <section className="room-bottom">
          <div className="room-size">
            <Ruler size={18} />
            <strong>Your room</strong>
            <label>
              Width{" "}
              <NumberInput
                aria-label="Room width in metres"
                min={3}
                max={10}
                step={0.1}
                unit="m"
                value={layout.width}
                onCommit={(width) => update((l) => ({ ...l, width }))}
              />{" "}
              m
            </label>
            <span>×</span>
            <label>
              Depth{" "}
              <NumberInput
                aria-label="Room depth in metres"
                min={3}
                max={10}
                step={0.1}
                unit="m"
                value={layout.depth}
                onCommit={(depth) => update((l) => ({ ...l, depth }))}
              />{" "}
              m
            </label>
          </div>
          <div className="layout-actions">
            <button
              className="text-button mobile-import"
              onClick={() => file.current?.click()}
            >
              <Upload size={14} />
              Import
            </button>
            <span className="open-floor">
              <span style={{ width: `${used * 100}%` }} />
              {Math.round((1 - used) * 100)}% open floor
            </span>
            <button
              className="text-button"
              onClick={() => {
                setPin(cloneLayout(layout));
                setToast("Layout pinned. Make changes, then compare.");
              }}
            >
              <Layers size={15} />
              {pin ? "Update pinned layout" : "Pin this layout"}
            </button>
            <button
              className="text-button"
              disabled={!pin}
              onClick={() => {
                setCompare(!compare);
                setTimeout(
                  () =>
                    comparison.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    }),
                  50,
                );
              }}
            >
              Compare <ArrowRight size={15} />
            </button>
          </div>
        </section>
        {compare && pin && (
          <section
            ref={comparison}
            className="comparison"
            aria-label="Layout comparison"
          >
            <div className="comparison-heading">
              <h2>A little before & after.</h2>
              <button
                className="icon-button"
                aria-label="Close comparison"
                onClick={() => setCompare(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="comparison-grid">
              <div>
                <h3>Pinned layout</h3>
                <PlanView
                  layout={pin}
                  readOnly={true}
                  selected={null}
                  onSelect={() => {}}
                  onMove={() => {}}
                />
                <p>
                  {checkLayout(pin).length} fit issues ·{" "}
                  {Math.round((1 - occupiedArea(pin)) * 100)}% open floor
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    update(() => cloneLayout(pin));
                    setToast("Pinned layout restored.");
                  }}
                >
                  Restore this layout
                  <RotateCcw size={14} />
                </button>
              </div>
              <div>
                <h3>Your current layout</h3>
                <PlanView
                  layout={layout}
                  selected={null}
                  onSelect={setSelected}
                  onMove={(id, x, z) => patch(id, { x, z })}
                />
                <p>
                  {issues.length} fit issues · {Math.round((1 - used) * 100)}%
                  open floor
                </p>
              </div>
            </div>
          </section>
        )}
        <section id="how-it-works" className="method">
          <div className="method-lead">
            <h2>
              Less measuring twice.
              <br />
              More making it yours.
            </h2>
            <p>
              A small spatial studio for the decisions that make a room feel
              right. Start with a room, add your pieces, and see how everything
              comes together.
            </p>
            <a
              href="https://github.com/diegocrisafu/me-lazy"
              target="_blank"
              rel="noreferrer"
            >
              Explore the engineering <ArrowRight size={17} />
            </a>
          </div>
          <div className="method-details">
            <details>
              <summary>
                What does “everything fits” mean?
                <Plus size={17} />
              </summary>
              <p>
                RoomFit checks furniture footprints for overlaps, room
                boundaries, and a 90 cm deep clearance zone in front of a 105 cm
                doorway. It checks your chosen dimensions in the layout—not
                whether furniture can be carried through a real doorway. Always
                measure your space before purchasing.
              </p>
            </details>
            <details>
              <summary>
                How do I plan with a keyboard?
                <Plus size={17} />
              </summary>
              <p>
                Select a piece from the furniture list. Use its width, depth and
                position fields, or focus the page and use arrow keys to move 5
                cm at a time (Shift moves 25 cm). Rotate using the labelled
                button. Undo with ⌘/Ctrl Z.
              </p>
            </details>
            <details>
              <summary>
                Where is my room saved?
                <Plus size={17} />
              </summary>
              <p>
                Your current layout stays in this browser's local storage. There
                are no accounts, analytics or uploads. Export a layout file to
                keep a backup or import it on another device. Pinned comparisons
                last until you refresh.
              </p>
            </details>
            <details>
              <summary>
                How are the fit checks calculated?
                <Plus size={17} />
              </summary>
              <p>
                Furniture uses oriented rectangular footprints. A
                separating-axis test checks intersections after rotation. Open
                floor uses a sampled union of footprints at 8 cm resolution, so
                overlapping furniture is counted once. The 3D scene and the
                floor plan share the same layout.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="#top">
          <Box size={22} />
          <span>roomfit.</span>
        </a>
        <span>
          Designed & built by{" "}
          <a href="mailto:diego.crisafu@gmail.com">Diego Crisafulli</a>
        </span>
        <a
          href="https://diegocrisafu.github.io/diego_ux-ui/"
          target="_blank"
          rel="noreferrer"
        >
          Try CrowdFlow <ArrowRight size={14} />
        </a>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
