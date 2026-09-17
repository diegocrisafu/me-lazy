import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import App from "./App";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>Let's reset the room.</h1>
        <p>
          The planner encountered an unexpected problem. Your exported files are
          safe.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("roomfit.layout.v1");
            location.reload();
          }}
        >
          Start with a fresh room
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
