import { describe, test, expect, beforeEach } from "vitest";
import {
  CURSOR_COLORS,
  getUserColor,
  getColorByName,
  clearUserColor,
  _resetColorMapForTests,
} from "./extractedCode/cursorsColors";
 
beforeEach(() => {
  _resetColorMapForTests();
});


describe("getUserColor — determinism and wrapping", () => {
  test("first user always gets CURSOR_COLORS[0]", () => {
    expect(getUserColor("user-first")).toEqual(CURSOR_COLORS[0]);
  });
 
  test("second distinct user gets CURSOR_COLORS[1]", () => {
    getUserColor("user-1");
    expect(getUserColor("user-2")).toEqual(CURSOR_COLORS[1]);
  });
 
  test("calling getUserColor for the same userId twice returns identical color", () => {
    const first  = getUserColor("user-stable");
    const second = getUserColor("user-stable");
    expect(first).toEqual(second);
  });
 
  test("repeated calls for the same userId do not advance the index", () => {
    getUserColor("user-repeat");
    getUserColor("user-repeat");
    getUserColor("user-repeat");
 
    // The next NEW user should still get index 1, not index 3.
    const nextUser = getUserColor("user-new");
    expect(nextUser).toEqual(CURSOR_COLORS[1]);
  });
 
  test("colors wrap at palette boundary", () => {
    const n = CURSOR_COLORS.length;
    // Fill all n slots
    for (let i = 0; i < n; i++) getUserColor(`wrap-user-${i}`);
 
    // n+1th new user wraps to index 0
    const wrapped = getUserColor("wrap-overflow");
    expect(wrapped).toEqual(CURSOR_COLORS[0]);
  });
 
  test("wrap produces CURSOR_COLORS[1] for the (n+2)th user", () => {
    const n = CURSOR_COLORS.length;
    for (let i = 0; i < n + 1; i++) getUserColor(`wrap-user-${i}`);
    const secondWrap = getUserColor("wrap-second-overflow");
    expect(secondWrap).toEqual(CURSOR_COLORS[1]);
  });
 
  test("all n palette entries are reachable before wrapping", () => {
    const assigned = new Set<string>();
    const n = CURSOR_COLORS.length;
    for (let i = 0; i < n; i++) {
      assigned.add(getUserColor(`user-${i}`).name);
    }
    // Every colour in the palette was assigned exactly once
    expect(assigned.size).toBe(n);
    CURSOR_COLORS.forEach(c => expect(assigned.has(c.name)).toBe(true));
  });
});

describe("getUserColor — module-level map leak", () => {
    test("LEAK DEMO: colors assigned in one block affect index in the next block", () => {
    // ── Block 1: simulates a first collab session (or first hook mount) ───
    // Assign two users — they consume indices 0 and 1.
    const sessionAUser1 = getUserColor("session-a-user-1");
    const sessionAUser2 = getUserColor("session-a-user-2");
 
    expect(sessionAUser1).toEqual(CURSOR_COLORS[0]);
    expect(sessionAUser2).toEqual(CURSOR_COLORS[1]);
 
    // ── Block 2: simulates a SECOND collab session joining the same process ─
    // In a correctly-isolated design (class-based registry, as the existing
    // CursorColorRegistry tests in doc 1 show), a new session's first user
    // should get CURSOR_COLORS[0].
    //
    // With the module-level map, the map still has 2 entries from block 1,
    // so the new user gets index 2 — WRONG.
    const sessionBFirstUser = getUserColor("session-b-user-1");
 
    // This assertion FAILS if the map were properly isolated.
    // It passes only because the map leaked from block 1.
    expect(sessionBFirstUser).toEqual(CURSOR_COLORS[2]); // ← LEAKED INDEX
 
    // The correct expectation (after fix) would be:
    // expect(sessionBFirstUser).toEqual(CURSOR_COLORS[0]);
  });
})

describe("clearUserColor", () => {
  test("cleared userId is no longer in the map — next call re-assigns a color", () => {
    getUserColor("user-1");
    getUserColor("user-2");
    clearUserColor("user-1");
 
    // user-1 is re-assigned; map has user-2 at index 1, so user-1 gets index 1 now
    const reassigned = getUserColor("user-1");
    // Map size before re-assign: 1 (user-2 only) → new index = 1 % n
    expect(reassigned).toEqual(CURSOR_COLORS[1]);
  });
 
  test("clearing a user does not affect other users' colors", () => {
    const color2 = getUserColor("user-2");
    getUserColor("user-1");
    clearUserColor("user-1");
 
    // user-2's color is unchanged
    expect(getUserColor("user-2")).toEqual(color2);
  });
 
  test("clearing a non-existent userId is a no-op (no throw)", () => {
    expect(() => clearUserColor("nobody")).not.toThrow();
  });
 
  test("BUG: clearing and re-adding a user can give them a DIFFERENT color", () => {
    // This is the colour-flip bug documented in the leak demo above.
    // It matters because the client stores the color in React state (RemoteCursor.color)
    // but the module map can diverge from that state after a clearUserColor call.
    const originalColor = getUserColor("user-1"); // index 0
    getUserColor("user-2");                        // index 1
 
    clearUserColor("user-1");
    // Map now has only user-2 at index 1.
    // Re-adding user-1: map.size is 1, so new index = 1 % n = 1
    const newColor = getUserColor("user-1");
 
    // Color CHANGED — this is the bug.
    // Any component that cached `originalColor` now shows the wrong colour.
    expect(newColor).not.toEqual(originalColor); // ← KNOWN BUG (colour flip)
  });
});

describe("CURSOR_COLORS palette — structural invariants", () => {
  test("every entry has name, hex, and light fields", () => {
    CURSOR_COLORS.forEach(color => {
      expect(typeof color.name).toBe("string");
      expect(color.name.length).toBeGreaterThan(0);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(color.light).toMatch(/^rgba\(/);
    });
  });
 
  test("all color names are unique", () => {
    const names = CURSOR_COLORS.map(c => c.name);
    expect(new Set(names).size).toBe(CURSOR_COLORS.length);
  });
 
  test("all hex values are unique (no two colors share the same hex)", () => {
    const hexes = CURSOR_COLORS.map(c => c.hex);
    expect(new Set(hexes).size).toBe(CURSOR_COLORS.length);
  });
 
  test("palette has at least 2 colors (minimum for meaningful multi-user sessions)", () => {
    expect(CURSOR_COLORS.length).toBeGreaterThanOrEqual(2);
  });
});

 
