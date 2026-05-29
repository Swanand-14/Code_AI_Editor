import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  addParticipant,
  removeParticipant,
  getParticipants,
  isValidParticipant,
  logActivity,
  getActivityLogs,
  resetAllState,
  sessionParticipants,
  type ParticipantInfo,
} from "./extractedCode/participantState";
import { CursorColorRegistry, CURSOR_COLORS } from "./extractedCode/cursorColorRegistry";

function makeParticipant(
  overrides: Partial<ParticipantInfo> & { socketId?: string } = {}
): ParticipantInfo {
  const socketId = overrides.socketId ?? "socket-default";
  return {
    userId:       "user-1",
    userName:     "Alice",
    role:         "Host",
    socketId,
    socketIds:    new Set([socketId]),
    joinedAt:     Date.now(),
    lastActivity: Date.now(),
    ...overrides,
  };
}
 
const SESSION = "session-test-001";
 
beforeEach(() => {
  resetAllState();
  vi.useRealTimers(); // default; tests that need fake timers opt in explicitly
});

describe("isValidParticipant", () => {
  test("returns true for a normal authenticated user", () => {
    expect(isValidParticipant("user-abc", "Alice")).toBe(true);
  });
 
  test("returns false when userId is undefined", () => {
    expect(isValidParticipant(undefined, "Alice")).toBe(false);
  });
 
  test("returns false when userName is undefined", () => {
    expect(isValidParticipant("user-abc", undefined)).toBe(false);
  });
 
  test("returns false for the literal string 'Anonymous'", () => {
    expect(isValidParticipant("user-abc", "Anonymous")).toBe(false);
  });
 
  test("returns false for a guest- prefixed userId", () => {
    expect(isValidParticipant("guest-socket-xyz", "Bob")).toBe(false);
  });
 
  test("returns false for empty string userId", () => {
    expect(isValidParticipant("", "Bob")).toBe(false);
  });
 
  test("returns false for empty string userName", () => {
    expect(isValidParticipant("user-1", "")).toBe(false);
  });
 
  test("is NOT case-insensitive — 'anonymous' (lowercase) is valid", () => {
    // Bug surface: only the exact string "Anonymous" is blocked.
    // 'anonymous' slips through — document this as a known limitation.
    expect(isValidParticipant("user-1", "anonymous")).toBe(true);
  });
  test("BUG: whitespace-only userId passes validation (truthy, not 'guest-', not 'Anonymous')", () => {
    // "   " is truthy so !userId is false — the check never fires.
    // This is a real injection surface: a client could send userId: "   "
    // and bypass the guest- prefix guard.
    //
    // Current behaviour (buggy): returns true
    // Desired behaviour after fix: return false (add .trim() check)
    const result = isValidParticipant("   ", "Alice");
    // Document the current broken state — update to toBe(false) after fix.
    expect(result).toBe(true); // ← KNOWN BUG: should be false
  });
  test("BUG: whitespace-only userName passes validation", () => {
    // Same root cause — !userName is false for "   ".
    const result = isValidParticipant("user-1", "   ");
    expect(result).toBe(true); // ← KNOWN BUG: should be false
  });
  test("BUG: 'anonymous' (lowercase) is NOT blocked — only exact 'Anonymous' is checked", () => {
    // The guard is `userName === "Anonymous"` — strict equality, no
    // case-normalisation.  A client sending userName: "anonymous" slips through.
    // Documented in the existing suite as a known limitation; pinned here so
    // it doesn't get silently "fixed" in a way that changes other behaviour.
    expect(isValidParticipant("user-1", "anonymous")).toBe(true); // known limitation
    expect(isValidParticipant("user-1", "ANONYMOUS")).toBe(true); // same gap
  });


});


describe("addParticipant — join semantics", () => {
  test("returns true on a brand-new join", () => {
    const p = makeParticipant({ userId: "user-1", socketId: "s-1" });
    expect(addParticipant(SESSION, p)).toBe(true);
  });
 
  test("participant is retrievable after joining", () => {
    const p = makeParticipant({ userId: "user-1", userName: "Alice", socketId: "s-1" });
    addParticipant(SESSION, p);
    const list = getParticipants(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe("user-1");
    expect(list[0].userName).toBe("Alice");
  });
 
  test("two different users join the same session → both present", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-2", userName: "Bob", socketId: "s-2" }));
    expect(getParticipants(SESSION)).toHaveLength(2);
  });
 
  test("returns false when the same user reconnects on a NEW socket (tab re-open)", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-old" }));
    const reconnect = makeParticipant({ userId: "user-1", socketId: "s-new" });
    expect(addParticipant(SESSION, reconnect)).toBe(false);
  });
 
  test("reconnecting user's new socket is added to their socketIds set", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-old" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-new" }));
    const map = sessionParticipants.get(SESSION)!;
    const p   = map.get("user-1")!;
    expect(p.socketIds.has("s-old")).toBe(true);
    expect(p.socketIds.has("s-new")).toBe(true);
  });
 
  test("same socketId sent twice is a no-op — participant not duplicated", () => {
    const p = makeParticipant({ userId: "user-1", socketId: "s-1" });
    addParticipant(SESSION, p);
    addParticipant(SESSION, p); // second call — same socket
    expect(getParticipants(SESSION)).toHaveLength(1);
  });
 
  test("userName update is applied on reconnect (name change across sessions)", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", userName: "OldName", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", userName: "NewName", socketId: "s-2" }));
    const map = sessionParticipants.get(SESSION)!;
    expect(map.get("user-1")!.userName).toBe("NewName");
  });
 
  test("each session gets its own participant namespace (no cross-session bleed)", () => {
    addParticipant("session-A", makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant("session-B", makeParticipant({ userId: "user-2", socketId: "s-2" }));
 
    expect(getParticipants("session-A")).toHaveLength(1);
    expect(getParticipants("session-B")).toHaveLength(1);
    expect(getParticipants("session-A")[0].userId).toBe("user-1");
    expect(getParticipants("session-B")[0].userId).toBe("user-2");
  });

  test("BUG: addParticipant with sessionId '' creates an entry under key ''", () => {
    // There is no guard in addParticipant against an empty string sessionId.
    // The Map grows a phantom entry that persists until server restart.
    // The collab:join handler should validate sessionId before calling this.
    //
    // Current behaviour (buggy): entry is created
    // Desired behaviour after fix: throw or return false without creating entry
    addParticipant("", makeParticipant({ userId: "user-1", socketId: "s-1" }));
 
    // The phantom entry exists
    expect(sessionParticipants.has("")).toBe(true); // ← KNOWN BUG
 
    // Real sessions are unaffected
    expect(sessionParticipants.has(SESSION)).toBe(false);
  });

});
 
describe("removeParticipant — full metadata purge (ghost-user prevention)", () => {
  test("removing the only socket sets wasLastConnection = true", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    const result = removeParticipant(SESSION, "s-1");
    expect(result.wasLastConnection).toBe(true);
  });
 
  test("participant is FULLY removed from the map after last socket disconnects", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    removeParticipant(SESSION, "s-1");
    expect(getParticipants(SESSION)).toHaveLength(0);
  });
 
  test("removing one socket when user has two sockets → wasLastConnection = false", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-2" }));
    const result = removeParticipant(SESSION, "s-1");
    expect(result.wasLastConnection).toBe(false);
  });
 
  test("user still appears in participant list after first of two sockets disconnects", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-2" }));
    removeParticipant(SESSION, "s-1");
    expect(getParticipants(SESSION)).toHaveLength(1);
    expect(getParticipants(SESSION)[0].userId).toBe("user-1");
  });
 
  test("disconnecting last socket of user-1 does NOT affect user-2", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-2", userName: "Bob", socketId: "s-2" }));
    removeParticipant(SESSION, "s-1");
    const remaining = getParticipants(SESSION);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe("user-2");
    expect(remaining[0].userName).toBe("Bob");
  });
 
  test("removing an unknown socketId returns null participant (no crash)", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    const result = removeParticipant(SESSION, "non-existent-socket");
    expect(result.participant).toBeNull();
    expect(result.wasLastConnection).toBe(false);
    // Existing participant must still be present
    expect(getParticipants(SESSION)).toHaveLength(1);
  });
 
  test("removing from an empty session returns null without throwing", () => {
    const result = removeParticipant("unknown-session", "s-x");
    expect(result.participant).toBeNull();
    expect(result.wasLastConnection).toBe(false);
  });
 
  test("GHOST USER: removing both sockets leaves zero participants", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-a" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-b" }));
    removeParticipant(SESSION, "s-a");
    removeParticipant(SESSION, "s-b");
    expect(getParticipants(SESSION)).toHaveLength(0);
    const map = sessionParticipants.get(SESSION)!;
    expect(map.size).toBe(0); // Map entry itself is gone
  });
 
  test("cursor and metadata are purged after last disconnect (no frozen ghost cursor)", () => {
    const p = makeParticipant({
      userId:  "user-1",
      socketId: "s-1",
      cursor: { fileId: "file-x", position: { lineNumber: 10, column: 5 } },
      activeFile: "src/App.tsx",
    });
    addParticipant(SESSION, p);
    removeParticipant(SESSION, "s-1");
    expect(getParticipants(SESSION)).toHaveLength(0);
    // Verify the participant Map no longer holds a reference
    const map = sessionParticipants.get(SESSION);
    expect(map?.has("user-1")).toBe(false);
  });
  test("three-tab disconnect: wasLastConnection is false for first two, true for last", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-2" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-3" }));
 
    const r1 = removeParticipant(SESSION, "s-1");
    const r2 = removeParticipant(SESSION, "s-2");
    const r3 = removeParticipant(SESSION, "s-3");
 
    expect(r1.wasLastConnection).toBe(false);
    expect(r2.wasLastConnection).toBe(false);
    expect(r3.wasLastConnection).toBe(true);
    expect(getParticipants(SESSION)).toHaveLength(0);
  });
});

describe("cursor coordinate isolation between participants", () => {
  test("updating user-1 cursor does not mutate user-2 entry", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-2", userName: "Bob", socketId: "s-2" }));
 
    const map = sessionParticipants.get(SESSION)!;
    const p1  = map.get("user-1")!;
    const p2  = map.get("user-2")!;
 
    // Simulate collab:update-activity mutating p1
    p1.cursor = { fileId: "file-A", position: { lineNumber: 42, column: 7 } };
 
    expect(p2.cursor).toBeUndefined(); // p2 must be untouched
  });
 
  test("updating activeFile for user-1 preserves user-2 activeFile", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1", activeFile: "index.ts" }));
    addParticipant(SESSION, makeParticipant({ userId: "user-2", userName: "Bob", socketId: "s-2", activeFile: "utils.ts" }));
 
    const map = sessionParticipants.get(SESSION)!;
    map.get("user-1")!.activeFile = "App.tsx";
 
    expect(map.get("user-2")!.activeFile).toBe("utils.ts");
  });
 
  test("getParticipants returns a SEPARATE serialized copy per call", () => {
    addParticipant(SESSION, makeParticipant({ userId: "user-1", socketId: "s-1" }));
    const list1 = getParticipants(SESSION);
    const list2 = getParticipants(SESSION);
 
    // Should not be the same object reference
    expect(list1).not.toBe(list2);
  });
});

describe("CursorColorRegistry — deterministic color assignment", () => {
  test("assigns the first CURSOR_COLOR to the first user", () => {
    const registry = new CursorColorRegistry();
    const color = registry.assign("user-1");
    expect(color).toEqual(CURSOR_COLORS[0]);
  });
 
  test("assigns different colors to different users", () => {
    const registry = new CursorColorRegistry();
    const c1 = registry.assign("user-1");
    const c2 = registry.assign("user-2");
    expect(c1.name).not.toBe(c2.name);
  });
 
  test("same userId always returns the same color (deterministic)", () => {
    const registry = new CursorColorRegistry();
    const first  = registry.assign("user-stable");
    const second = registry.assign("user-stable");
    expect(first).toEqual(second);
  });
 
  test("colors wrap around when more users than CURSOR_COLORS.length", () => {
    const registry = new CursorColorRegistry();
    const n = CURSOR_COLORS.length;
    for (let i = 0; i < n; i++) registry.assign(`user-${i}`);
    // n+1th user wraps to first color
    const wrapped = registry.assign(`user-${n}`);
    expect(wrapped).toEqual(CURSOR_COLORS[0]);
  });
 
  test("clear() removes ALL users — no ghost color entries", () => {
    const registry = new CursorColorRegistry();
    registry.assign("user-1");
    registry.assign("user-2");
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.has("user-1")).toBe(false);
  });
 
  test("after clear(), colors restart from index 0", () => {
    const registry = new CursorColorRegistry();
    registry.assign("user-A"); // gets CURSOR_COLORS[0]
    registry.assign("user-B"); // gets CURSOR_COLORS[1]
    registry.clear();
    // Now assign user-C → should get CURSOR_COLORS[0] again
    const color = registry.assign("user-C");
    expect(color).toEqual(CURSOR_COLORS[0]);
  });
 
  test("ARCHITECTURAL BUG DEMO: module-level map leaks between instances", () => {
    // This test proves that your original doc-5 approach (module-level Map)
    // would assign CURSOR_COLORS[2] to the first user of a "new" hook instance
    // because two previous users were already registered in the module Map.
    //
    // Using the class-based registry, two separate instances are fully isolated:
    const r1 = new CursorColorRegistry();
    const r2 = new CursorColorRegistry();
 
    r1.assign("user-from-previous-session-A");
    r1.assign("user-from-previous-session-B");
 
    // r2 is a fresh instance — starts at index 0 regardless of r1
    const color = r2.assign("first-user-new-session");
    expect(color).toEqual(CURSOR_COLORS[0]); // Would be CURSOR_COLORS[2] with module-level map!
  });
 
  test("remove() purges a single user without affecting others", () => {
    const registry = new CursorColorRegistry();
    registry.assign("user-1");
    registry.assign("user-2");
    registry.remove("user-1");
    expect(registry.has("user-1")).toBe(false);
    expect(registry.has("user-2")).toBe(true);
  });
});

describe("logActivity — deduplication, capping, and activity isolation", () => {
  test("first log entry is returned and stored", () => {
    const entry = logActivity(SESSION, "user-1", "Alice", "joined");
    expect(entry).not.toBeNull();
    expect(getActivityLogs(SESSION)).toHaveLength(1);
  });
 
  test("duplicate action within 1 second is dropped (returns null)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
 
    logActivity(SESSION, "user-1", "Alice", "joined");
    const second = logActivity(SESSION, "user-1", "Alice", "joined");
 
    expect(second).toBeNull();
    expect(getActivityLogs(SESSION)).toHaveLength(1);
 
    vi.useRealTimers();
  });
 
  test("same action after >1 second by same user is NOT a duplicate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    logActivity(SESSION, "user-1", "Alice", "edited file");
    vi.setSystemTime(new Date("2024-01-01T00:00:02.000Z")); // +2 seconds
    const second = logActivity(SESSION, "user-1", "Alice", "edited file");
    expect(second).not.toBeNull();
    vi.useRealTimers();
  });
 
  test("different actions by same user in same second are both stored", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.500Z"));
    const e1 = logActivity(SESSION, "user-1", "Alice", "joined");
    const e2 = logActivity(SESSION, "user-1", "Alice", "opened file");
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    vi.useRealTimers();
  });
 
  test("different users can log the same action in same second (not duplicates)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    const e1 = logActivity(SESSION, "user-1", "Alice", "joined");
    const e2 = logActivity(SESSION, "user-2", "Bob",   "joined");
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    vi.useRealTimers();
  });
 
  test("log is capped at 50 entries (oldest are pruned)", () => {
    for (let i = 0; i < 60; i++) {
      // Unique timestamp per entry to avoid dedup
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + i * 2000);
      logActivity(SESSION, "user-1", "Alice", `action-${i}`);
    }
    vi.useRealTimers();
    expect(getActivityLogs(SESSION).length).toBeLessThanOrEqual(50);
  });
 
  test("most recent entry appears first (prepend order)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    logActivity(SESSION, "user-1", "Alice", "joined");
    vi.setSystemTime(new Date("2024-01-01T00:00:05.000Z"));
    logActivity(SESSION, "user-1", "Alice", "edited file");
    vi.useRealTimers();
 
    const logs = getActivityLogs(SESSION);
    expect(logs[0].action).toBe("edited file"); // most recent first
    expect(logs[1].action).toBe("joined");
  });
 
  test("each session maintains its own separate activity log", () => {
    logActivity("session-X", "user-1", "Alice", "joined");
    logActivity("session-Y", "user-2", "Bob",   "joined");
    expect(getActivityLogs("session-X")).toHaveLength(1);
    expect(getActivityLogs("session-Y")).toHaveLength(1);
    expect(getActivityLogs("session-X")[0].userName).toBe("Alice");
  });
 
  test("unknown session returns an empty array (not undefined or null)", () => {
    const logs = getActivityLogs("no-such-session");
    expect(logs).toBeInstanceOf(Array);
    expect(logs).toHaveLength(0);
  });
  test("two calls in the same 1-second bucket produce only one entry", () => {
    vi.useFakeTimers();
    // Both calls land in the same 1s bucket
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    logActivity(SESSION, "user-1", "Alice", "edited file");
 
    vi.setSystemTime(new Date("2024-01-01T00:00:00.999Z")); // still same bucket
    const second = logActivity(SESSION, "user-1", "Alice", "edited file");
 
    expect(second).toBeNull();
    expect(getActivityLogs(SESSION)).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe("collab:join entry-gate: isValidParticipant integration with addParticipant", () => {
  test("valid user gets added to session", () => {
    if (!isValidParticipant("user-valid", "Alice")) return;
    addParticipant(SESSION, makeParticipant({ userId: "user-valid", userName: "Alice" }));
    expect(getParticipants(SESSION)).toHaveLength(1);
  });
 
  test("Anonymous user is blocked before addParticipant is called", () => {
    const allowed = isValidParticipant("user-x", "Anonymous");
    expect(allowed).toBe(false);
    // If the gate is respected, we should NEVER call addParticipant
    // Verify the session remains empty:
    expect(getParticipants(SESSION)).toHaveLength(0);
  });
 
  test("guest- user is blocked at the gate", () => {
    const allowed = isValidParticipant("guest-socket-abc", "Bob");
    expect(allowed).toBe(false);
    expect(getParticipants(SESSION)).toHaveLength(0);
  });
 
  // test("empty sessionId would create a phantom session-map entry under key ''", () => {
  //   // ARCHITECTURAL BUG: Nothing prevents addParticipant("", participant).
  //   // This creates a Map entry under key "" which persists until server restart.
  //   // Your collab:join handler should validate sessionId before calling addParticipant.
  //   // This test documents the current unguarded behaviour:
  //   addParticipant("", makeParticipant({ userId: "user-1", socketId: "s-1" }));
  //   const phantomEntry = getParticipants("");
  //   expect(phantomEntry).toHaveLength(1); // The bug exists — document it, then fix it
  //   // After fix: expect(phantomEntry).toHaveLength(0);
  // });
 
  // test("userId with only whitespace slips through isValidParticipant (known gap)", () => {
  //   // BUG: Your isValidParticipant only checks falsy, not .trim().
  //   // "   " is truthy and not "Anonymous", so it passes.
  //   const result = isValidParticipant("   ", "Alice");
  //   // Current (buggy) behaviour: returns true
  //   // After fix (add .trim() check): expect(result).toBe(false)
  //   // Documenting the current state:
  //   expect(typeof result).toBe("boolean");
  //   // TODO: tighten this — "   ".trim() === "" should be rejected
  // });
});
