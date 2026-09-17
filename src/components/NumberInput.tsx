import { useEffect, useId, useRef, useState } from "react";

type NumberInputProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  suffix?: string;
  "aria-label": string;
  onCommit: (value: number) => void;
  normalize?: (value: number) => number;
};

type NumberResult =
  { value: number; error: null } | { value: null; error: string };
export type NumberDraft = {
  text: string;
  dirty: boolean;
  error: string | null;
};
type NumberRange = Pick<NumberInputProps, "min" | "max" | "unit" | "normalize">;

export function parseNumberDraft(
  draft: string,
  min: number,
  max: number,
  unit = "",
  normalize?: (value: number) => number,
): NumberResult {
  const text = draft.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return { value: null, error: "Enter a number." };
  }
  const value = Number(text);
  const normalized = normalize ? normalize(value) : value;
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    !Number.isFinite(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    return {
      value: null,
      error: `Enter ${min}–${max}${unit ? ` ${unit}` : ""}.`,
    };
  }
  return { value: normalized, error: null };
}

export function commitNumberDraft(
  state: NumberDraft,
  current: number,
  range: NumberRange,
): { state: NumberDraft; value: number | null } {
  if (!state.dirty) return { state, value: null };
  const result = parseNumberDraft(
    state.text,
    range.min,
    range.max,
    range.unit,
    range.normalize,
  );
  if (result.error !== null)
    return { state: { ...state, error: result.error }, value: null };
  return {
    state: { text: String(result.value), dirty: false, error: null },
    value: result.value === current ? null : result.value,
  };
}

export default function NumberInput({
  value,
  min,
  max,
  step = 1,
  unit,
  suffix,
  "aria-label": label,
  onCommit,
  normalize,
}: NumberInputProps) {
  const [editor, setEditor] = useState<NumberDraft>({
    text: String(value),
    dirty: false,
    error: null,
  });
  const liveEditor = useRef(editor);
  const draft = editor.text;
  const error = editor.error;
  const errorId = useId();
  const edit = (next: NumberDraft) => {
    liveEditor.current = next;
    setEditor(next);
  };

  // Undo, imports, and changes made in the scene remain authoritative.
  useEffect(() => {
    edit({ text: String(value), dirty: false, error: null });
  }, [value, min, max]);

  const commit = () => {
    const result = commitNumberDraft(liveEditor.current, value, {
      min,
      max,
      unit,
      normalize,
    });
    edit(result.state);
    if (result.value !== null) onCommit(result.value);
  };

  return (
    <span
      className="number-input"
      style={{ display: "inline-block", minWidth: 0 }}
    >
      <span
        className="number-input-control"
        style={{ display: "inline-block", position: "relative", width: "100%" }}
      >
        <input
          aria-label={label}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={
            Number.isFinite(Number(draft)) && draft.trim()
              ? Number(draft)
              : value
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={draft}
          onChange={(event) => {
            edit({ text: event.target.value, dirty: true, error: null });
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              edit({ text: String(value), dirty: false, error: null });
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const parsed = parseNumberDraft(draft, min, max);
              const next =
                (parsed.value ?? value) +
                (event.key === "ArrowUp" ? step : -step);
              edit({
                text: String(
                  Math.min(max, Math.max(min, Math.round(next * 1e8) / 1e8)),
                ),
                dirty: true,
                error: null,
              });
            }
          }}
        />
        {suffix && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 9,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 10,
              pointerEvents: "none",
            }}
          >
            {suffix}
          </span>
        )}
      </span>
      {error && (
        <span
          id={errorId}
          role="alert"
          className="number-input-error"
          style={{
            display: "block",
            marginTop: 4,
            color: "#8b352b",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
