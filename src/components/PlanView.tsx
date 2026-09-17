import { useId, useRef } from "react";
import {
  type Layout,
  type Piece,
  corners,
  doorZone,
  checkLayout,
  snap,
} from "../engine/room";
export default function PlanView({
  layout,
  selected,
  onSelect,
  onMove,
  readOnly = false,
}: {
  layout: Layout;
  selected: string | null;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, z: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const gridId = `plan-grid-${useId().replaceAll(":", "")}`;
  const drag = useRef<{
    p: Piece;
    dx: number;
    dz: number;
    pointerId: number;
  } | null>(null);
  const issues = checkLayout(layout);
  const dz = doorZone(layout);
  const point = (e: React.PointerEvent) => {
    const svg = ref.current!,
      p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        svg.getScreenCTM()!.inverse(),
      );
    return { x: p.x, z: p.y };
  };
  return (
    <svg
      ref={ref}
      className="plan-view"
      viewBox={`-.7 -.6 ${layout.width + 1.4} ${layout.depth + 1.2}`}
      role="img"
      aria-label={
        readOnly
          ? "Pinned room floor plan"
          : "Interactive room floor plan. Use the furniture list and position controls to move pieces with a keyboard."
      }
      onPointerMove={(e) => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return;
        const q = point(e);
        const el = ref.current!.querySelector(
          `[data-piece="${CSS.escape(drag.current.p.id)}"]`,
        );
        el?.setAttribute(
          "transform",
          `translate(${Math.max(-4, Math.min(layout.width + 4, snap(q.x - drag.current.dx))) - drag.current.p.x} ${Math.max(-4, Math.min(layout.depth + 4, snap(q.z - drag.current.dz))) - drag.current.p.z})`,
        );
      }}
      onPointerUp={(e) => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return;
        const q = point(e);
        ref.current
          ?.querySelector(`[data-piece="${CSS.escape(drag.current.p.id)}"]`)
          ?.removeAttribute("transform");
        onMove(
          drag.current.p.id,
          Math.max(-4, Math.min(layout.width + 4, snap(q.x - drag.current.dx))),
          Math.max(-4, Math.min(layout.depth + 4, snap(q.z - drag.current.dz))),
        );
        drag.current = null;
      }}
      onPointerCancel={() => {
        if (drag.current)
          ref.current
            ?.querySelector(`[data-piece="${CSS.escape(drag.current.p.id)}"]`)
            ?.removeAttribute("transform");
        drag.current = null;
      }}
    >
      <defs>
        <pattern
          id={gridId}
          width=".25"
          height=".25"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M .25 0 H 0 V .25"
            fill="none"
            stroke="#ddd9cf"
            strokeWidth=".007"
          />
        </pattern>
      </defs>
      <rect
        width={layout.width}
        height={layout.depth}
        fill="#f9f7f1"
        stroke="#4b504a"
        strokeWidth=".055"
      />
      <rect
        width={layout.width}
        height={layout.depth}
        fill={`url(#${gridId})`}
      />
      <rect
        x={dz.x - dz.width / 2}
        y={dz.z - dz.depth / 2}
        width={dz.width}
        height={dz.depth}
        fill="#85a393"
        fillOpacity=".15"
        stroke="#557664"
        strokeDasharray=".07 .04"
        strokeWidth=".015"
      />
      <text
        x={dz.x}
        y={layout.depth - 0.1}
        fontSize=".13"
        textAnchor="middle"
        fill="#385746"
      >
        Door clearance
      </text>
      <path
        d={`M 0 -.22 H ${layout.width} M 0 -.3 V -.14 M ${layout.width} -.3 V -.14`}
        stroke="#74786e"
        strokeWidth=".012"
      />
      <text
        x={layout.width / 2}
        y="-.31"
        textAnchor="middle"
        fontSize=".15"
        fill="#464b44"
      >
        {layout.width.toFixed(1)} m
      </text>
      <text
        x="-.25"
        y={layout.depth / 2}
        textAnchor="middle"
        fontSize=".15"
        fill="#464b44"
        transform={`rotate(-90 -.25 ${layout.depth / 2})`}
      >
        {layout.depth.toFixed(1)} m
      </text>
      {layout.pieces.map((p) => {
        const bad = issues.some((i) => i.ids.includes(p.id));
        return (
          <g
            key={`${p.id}-${p.x}-${p.z}`}
            data-piece={p.id}
            className={readOnly ? "plan-piece read-only" : "plan-piece"}
            onPointerDown={(e) => {
              if (readOnly) return;
              e.preventDefault();
              onSelect(p.id);
              const q = point(e);
              drag.current = {
                p,
                dx: q.x - p.x,
                dz: q.z - p.z,
                pointerId: e.pointerId,
              };
              ref.current!.setPointerCapture(e.pointerId);
            }}
          >
            <polygon
              points={corners(p)
                .map((v) => `${v.x},${v.z}`)
                .join(" ")}
              fill={p.color}
              fillOpacity=".55"
              stroke={
                bad ? "#ab4939" : selected === p.id ? "#355ea2" : "#626c62"
              }
              strokeWidth={selected === p.id ? 0.045 : 0.015}
            />
            <text
              x={p.x}
              y={p.z + 0.04}
              textAnchor="middle"
              fontSize=".11"
              fill="#242e29"
              style={{ pointerEvents: "none" }}
            >
              {p.kind === "plant" ? "Plant" : p.name.split(" ").slice(-1)}
            </text>
            {selected === p.id && (
              <text
                x={p.x}
                y={p.z + 0.23}
                textAnchor="middle"
                fontSize=".09"
                fill="#283d58"
              >
                {Math.round(p.width * 100)} × {Math.round(p.depth * 100)} cm
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
