import type { Kind } from "../engine/room";
export default function FurnitureIcon({
  kind,
  color = "#ae795c",
}: {
  kind: Kind;
  color?: string;
}) {
  return (
    <svg viewBox="0 0 96 70" aria-hidden="true" className="furniture-icon">
      <ellipse cx="48" cy="60" rx="33" ry="4" fill="#363c2e" opacity=".09" />
      {kind === "sofa" ? (
        <g fill={color} stroke="#563e33" strokeWidth="1.3">
          <path d="M18 49V21q0-6 7-6h45q7 0 7 6v28z" />
          <rect x="16" y="35" width="65" height="20" rx="5" />
          <path d="M20 55v7m56-7v7M48 18v32" />
          <rect x="12" y="29" width="10" height="25" rx="4" />
          <rect x="75" y="29" width="10" height="25" rx="4" />
        </g>
      ) : kind === "chair" ? (
        <g fill={color} stroke="#394b3a" strokeWidth="1.3">
          <rect x="29" y="12" width="38" height="33" rx="12" />
          <rect x="22" y="36" width="52" height="18" rx="8" />
          <path d="M29 53l-4 10m42-10 4 10" />
        </g>
      ) : kind === "plant" ? (
        <g>
          <path d="M48 45V12" stroke="#667955" strokeWidth="3" />
          <g fill={color}>
            <ellipse
              cx="37"
              cy="20"
              rx="14"
              ry="6"
              transform="rotate(30 37 20)"
            />
            <ellipse
              cx="59"
              cy="12"
              rx="14"
              ry="6"
              transform="rotate(-35 59 12)"
            />
            <ellipse
              cx="60"
              cy="31"
              rx="14"
              ry="6"
              transform="rotate(-25 60 31)"
            />
          </g>
          <path d="M34 42h28l-4 20H38z" fill="#b98162" />
        </g>
      ) : kind === "shelf" ? (
        <g fill={color} stroke="#5c4a35" strokeWidth="1.5">
          <rect x="25" y="6" width="48" height="54" rx="1" />
          <path
            d="M28 10h42v15H28zm0 19h42v12H28zm0 16h42v12H28z"
            fill="#ede7d9"
          />
          <path
            d="M34 24V14m6 10V11m5 13 4-13M58 40V31m5 9V29"
            strokeWidth="4"
          />
        </g>
      ) : kind === "bed" ? (
        <g fill={color} stroke="#676558" strokeWidth="1.3">
          <rect x="22" y="10" width="52" height="20" rx="4" />
          <path d="M22 22h52l9 34H13z" />
          <rect x="28" y="23" width="17" height="10" rx="3" fill="#f2eee4" />
          <rect x="50" y="23" width="17" height="10" rx="3" fill="#f2eee4" />
          <path d="M14 43h67M20 56v6m56-6v6" />
        </g>
      ) : (
        <g fill={color} stroke="#695039" strokeWidth="1.5">
          <path d="M23 35l-4 25m55-25 4 25m-42-25-1 21m28-21 2 21" />
          {kind === "table" ? (
            <ellipse cx="48" cy="33" rx="34" ry="12" />
          ) : (
            <>
              <rect x="13" y="27" width="70" height="8" rx="2" />
              <rect x="41" y="9" width="22" height="18" rx="1" fill="#39443e" />
              <path d="M39 27h28" />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
