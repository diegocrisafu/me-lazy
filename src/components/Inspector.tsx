import { AlertTriangle, Check, RotateCw, ScanLine, Trash2 } from "lucide-react";
import {
  CATALOG,
  snap,
  type Issue,
  type Layout,
  type Piece,
} from "../engine/room";
import FurnitureIcon from "./FurnitureIcon";
import NumberInput from "./NumberInput";

export type InspectorProps = {
  piece: Piece | undefined;
  layout: Pick<Layout, "width" | "depth">;
  issues: Issue[];
  onChange: (id: string, changes: Partial<Piece>) => void;
  onRemove: (id: string) => void;
};

export default function Inspector({
  piece,
  layout,
  issues,
  onChange,
  onRemove,
}: InspectorProps) {
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <h2>{piece ? "Make it yours" : "Room settings"}</h2>
        <ScanLine size={17} />
      </div>
      {piece ? (
        <>
          <div className="selected-preview">
            <FurnitureIcon kind={piece.kind} color={piece.color} />
          </div>
          <h3>{piece.name}</h3>
          <p className="piece-subtitle">
            {CATALOG.find((c) => c.kind === piece.kind)?.description}
          </p>
          <div className="inspector-section">
            <div className="section-label">
              Dimensions <span>cm</span>
            </div>
            <div className="dimension-fields">
              <label>
                Width
                <NumberInput
                  aria-label="Furniture width in centimetres"
                  min={20}
                  max={400}
                  step={5}
                  unit="cm"
                  value={Math.round(piece.width * 100)}
                  onCommit={(value) =>
                    onChange(piece.id, { width: value / 100 })
                  }
                />
              </label>
              <label>
                Depth
                <NumberInput
                  aria-label="Furniture depth in centimetres"
                  min={20}
                  max={400}
                  step={5}
                  unit="cm"
                  value={Math.round(piece.depth * 100)}
                  onCommit={(value) =>
                    onChange(piece.id, { depth: value / 100 })
                  }
                />
              </label>
            </div>
          </div>
          <div className="inspector-section">
            <div className="section-label">
              Finish
              <span>
                {piece.color ===
                CATALOG.find((c) => c.kind === piece.kind)?.color
                  ? "Original"
                  : "Custom"}
              </span>
            </div>
            <div className="swatches">
              {["#b97556", "#788271", "#c5bda9", "#5d6b7b", "#a6805a"].map(
                (c, i) => (
                  <button
                    key={c}
                    className={piece.color === c ? "swatch active" : "swatch"}
                    style={{ background: c }}
                    aria-label={
                      ["Terracotta", "Sage", "Linen", "Slate", "Oak"][i]
                    }
                    aria-pressed={piece.color === c}
                    onClick={() => onChange(piece.id, { color: c })}
                  >
                    {piece.color === c && <Check size={15} />}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="inspector-section">
            <div className="section-label">
              Position<span>5 cm steps</span>
            </div>
            <div className="position-fields">
              <label>
                From left
                <NumberInput
                  aria-label="Position from left in metres"
                  min={-4}
                  max={layout.width + 4}
                  step={0.05}
                  unit="m"
                  suffix="m"
                  normalize={snap}
                  value={piece.x}
                  onCommit={(x) => onChange(piece.id, { x })}
                />
              </label>
              <label>
                From back
                <NumberInput
                  aria-label="Position from back in metres"
                  min={-4}
                  max={layout.depth + 4}
                  step={0.05}
                  unit="m"
                  suffix="m"
                  normalize={snap}
                  value={piece.z}
                  onCommit={(z) => onChange(piece.id, { z })}
                />
              </label>
            </div>
            <button
              className="rotate-button"
              onClick={() =>
                onChange(piece.id, { rotation: (piece.rotation + 90) % 360 })
              }
            >
              <RotateCw size={15} /> Rotate 90°
              <span>{piece.rotation}°</span>
            </button>
          </div>
          <div className="piece-checks">
            {issues.filter((i) => i.ids.includes(piece.id)).length ? (
              issues
                .filter((i) => i.ids.includes(piece.id))
                .map((i, n) => (
                  <p className="check-warning" key={n}>
                    <AlertTriangle size={14} />
                    {i.message}
                  </p>
                ))
            ) : (
              <p>
                <Check size={15} />
                This piece has room to breathe.
              </p>
            )}
          </div>
          <button className="remove-button" onClick={() => onRemove(piece.id)}>
            <Trash2 size={14} />
            Remove piece
          </button>
        </>
      ) : (
        <p className="select-note">
          Select furniture in the room or add a new piece to adjust its size and
          finish.
        </p>
      )}
    </aside>
  );
}
