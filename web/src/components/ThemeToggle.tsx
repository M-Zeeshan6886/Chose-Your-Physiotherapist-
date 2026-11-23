"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Auto", light: "Light", dark: "Dark" };
const ICON: Record<Mode, string> = { system: "◐", light: "☀", dark: "☾" };

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.mode = mode;
  try { localStorage.setItem("cyd_theme", mode); } catch {}
}

/** Light / Dark / Auto (follows the phone or computer setting). The choice is remembered. */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    setMode((document.documentElement.dataset.mode as Mode) || "system");
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((document.documentElement.dataset.mode || "system") === "system") apply("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`Colour theme: ${LABEL[mode]}. Press to change.`}
      onClick={() => { const n = NEXT[mode]; apply(n); setMode(n); }}
    >
      <span aria-hidden="true">{ICON[mode]}</span> {LABEL[mode]}
    </button>
  );
}
