// ─────────────────────────────────────────────────────────────────────────────
// cursorColorRegistry.ts
//
// Extracted from useRemoteCursors (doc 5).  The original code keeps
// `userColorMap` as a module-level singleton — meaning it NEVER gets cleared
// between React renders / hook remounts unless you explicitly call clear().
// This file exposes the same logic as a class so the leak is explicit and
// testable.
// ─────────────────────────────────────────────────────────────────────────────

export interface CursorColor {
  name:       string;
  primary:    string;
  background: string;
  border:     string;
}

export const CURSOR_COLORS: CursorColor[] = [
  { name: "blue",   primary: "#3b82f6", background: "#eff6ff", border: "#93c5fd" },
  { name: "green",  primary: "#22c55e", background: "#f0fdf4", border: "#86efac" },
  { name: "purple", primary: "#a855f7", background: "#faf5ff", border: "#d8b4fe" },
  { name: "orange", primary: "#f97316", background: "#fff7ed", border: "#fdba74" },
  { name: "pink",   primary: "#ec4899", background: "#fdf2f8", border: "#f9a8d4" },
  { name: "teal",   primary: "#14b8a6", background: "#f0fdfa", border: "#5eead4" },
];

/**
 * CursorColorRegistry
 *
 * Manages deterministic color assignment for remote users.
 * Wraps the module-level map from doc 5 as a class so tests can create
 * isolated instances without the singleton bleed-through bug.
 */
export class CursorColorRegistry {
  private map = new Map<string, CursorColor>();

  assign(userId: string): CursorColor {
    if (!this.map.has(userId)) {
      const index = this.map.size % CURSOR_COLORS.length;
      this.map.set(userId, CURSOR_COLORS[index]);
    }
    return this.map.get(userId)!;
  }

  get(userId: string): CursorColor | undefined {
    return this.map.get(userId);
  }

  remove(userId: string): void {
    this.map.delete(userId);
  }

  /** Purge everything — must be called on socket disconnect / hook unmount */
  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }

  has(userId: string): boolean {
    return this.map.has(userId);
  }
}