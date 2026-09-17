import type { ChangeEventHandler, RefObject } from "react";
import { AlertTriangle, ChevronRight, Plus, Ruler, Upload } from "lucide-react";
import { CATALOG, type Issue, type Kind, type Piece } from "../engine/room";
import FurnitureIcon from "./FurnitureIcon";

export type FurniturePanelProps = {
  pieces: Piece[];
  selected: string | null;
  catalog: boolean;
  issues: Issue[];
  fileRef: RefObject<HTMLInputElement | null>;
  onCatalogChange: (catalog: boolean) => void;
  onSelect: (id: string) => void;
  onAdd: (kind: Kind) => void;
  onImport: ChangeEventHandler<HTMLInputElement>;
};

export default function FurniturePanel({
  pieces,
  selected,
  catalog,
  issues,
  fileRef,
  onCatalogChange,
  onSelect,
  onAdd,
  onImport,
}: FurniturePanelProps) {
  return (
    <aside className="furniture-panel">
      <div className="panel-heading">
        <h2>{catalog ? "Find your next piece" : "In your room"}</h2>
        <span className="count">
          {catalog ? CATALOG.length : pieces.length}
        </span>
      </div>
      <div className="segmented furniture-tabs">
        <button
          onClick={() => onCatalogChange(false)}
          className={!catalog ? "chosen" : ""}
        >
          Your furniture
        </button>
        <button
          onClick={() => onCatalogChange(true)}
          className={catalog ? "chosen" : ""}
        >
          <Plus size={13} /> Add new
        </button>
      </div>
      <div className="furniture-list">
        {catalog
          ? CATALOG.map((p) => (
              <button
                className="furniture-item"
                key={p.kind}
                onClick={() => onAdd(p.kind)}
              >
                <FurnitureIcon kind={p.kind} color={p.color} />
                <span className="furniture-text">
                  <strong>{p.name}</strong>
                  <small>
                    {Math.round(p.width * 100)} × {Math.round(p.depth * 100)} cm
                  </small>
                </span>
                <Plus size={15} />
              </button>
            ))
          : pieces.map((p) => (
              <button
                key={p.id}
                className={`furniture-item ${selected === p.id ? "selected" : ""}`}
                onClick={() => onSelect(p.id)}
                aria-pressed={selected === p.id}
              >
                <FurnitureIcon kind={p.kind} color={p.color} />
                <span className="furniture-text">
                  <strong>{p.name}</strong>
                  <small>
                    {Math.round(p.width * 100)} × {Math.round(p.depth * 100)} cm
                  </small>
                </span>
                {issues.some((i) => i.ids.includes(p.id)) ? (
                  <AlertTriangle className="danger" size={15} />
                ) : selected === p.id ? (
                  <ChevronRight size={15} />
                ) : null}
              </button>
            ))}
      </div>
      {!catalog && (
        <button className="add-furniture" onClick={() => onCatalogChange(true)}>
          <Plus size={16} /> Add a piece
        </button>
      )}
      <div className="shelf-note">
        <Ruler size={17} />
        <p>
          Editable dimensions.
          <br />A little less guesswork.
        </p>
      </div>
      <button
        className="text-button import-button"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={14} /> Import a layout
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        tabIndex={-1}
        onChange={onImport}
      />
    </aside>
  );
}
