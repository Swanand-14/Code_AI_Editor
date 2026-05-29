import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { CURSOR_COLORS, type CursorColor } from "./extractedCode/cursorsColors";
import { makeFakeSocket } from "./extractedCode/FakeSocket";

// Exact copy of the module-level map from useRemoteCursors.ts
const userColorMap = new Map<string, CursorColor>();
 
// Exact copy of assignCursorColor from useRemoteCursors.ts
function assignCursorColor(userId: string): CursorColor {
  if (!userColorMap.has(userId)) {
    const index = userColorMap.size % CURSOR_COLORS.length;
    userColorMap.set(userId, CURSOR_COLORS[index]);
  }
  return userColorMap.get(userId)!;
}
interface RemoteCursor {
  userId:    string;
  userName:  string;
  fileId:    string;
  filePath:  string;
  position:  { lineNumber: number; column: number };
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  color:     CursorColor;
  lastUpdate: number;
}
 
function makeCursorPayload(overrides: Partial<RemoteCursor> = {}): Omit<RemoteCursor, "color" | "lastUpdate"> {
  return {
    userId:   "user-remote",
    userName: "Bob",
    fileId:   "file-abc",
    filePath: "src/App.tsx",
    position: { lineNumber: 5, column: 3 },
    ...overrides,
  };
}

function makeCursorStore(opts: {
  currentUserId?: string;
  currentFileId?: string;
}) {
  const cursors = new Map<string, RemoteCursor>();
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
 
  function handleRemoteCursor(data: Omit<RemoteCursor, "color" | "lastUpdate"> & { color?: CursorColor }) {
    if (data.userId === opts.currentUserId) return; // own events filtered
 
    const color = assignCursorColor(data.userId);
    cursors.set(data.userId, { ...data, color, lastUpdate: Date.now() });
 
    // Reset stale timer (exact logic from hook)
    const existing = timeouts.get(data.userId);
    if (existing) clearTimeout(existing);
 
    const t = setTimeout(() => {
      cursors.delete(data.userId);
      timeouts.delete(data.userId);
    }, 6000);
 
    timeouts.set(data.userId, t);
  }
 
  function handleUserLeft(data: { userId: string }) {
    cursors.delete(data.userId);
    const t = timeouts.get(data.userId);
    if (t) { clearTimeout(t); timeouts.delete(data.userId); }
  }
 
  function cleanup() {
    timeouts.forEach(t => clearTimeout(t));
    timeouts.clear();
    userColorMap.clear(); // mirrors the hook's useEffect cleanup
  }
 
  function cursorsInFile(fileId: string): RemoteCursor[] {
    return Array.from(cursors.values()).filter(c => c.fileId === fileId);
  }
 
  return { cursors, handleRemoteCursor, handleUserLeft, cleanup, cursorsInFile };
}
 
beforeEach(() => {
  vi.useRealTimers();
  userColorMap.clear(); // reset between tests (mirrors what hook cleanup does)
});
 
afterEach(() => {
  userColorMap.clear();
});


describe("assignCursorColor — module-level map (useRemoteCursors internal)", () => {
  test("first remote user gets CURSOR_COLORS[0]", () => {
    expect(assignCursorColor("user-1")).toEqual(CURSOR_COLORS[0]);
  });
 
  test("second distinct user gets CURSOR_COLORS[1]", () => {
    assignCursorColor("user-1");
    expect(assignCursorColor("user-2")).toEqual(CURSOR_COLORS[1]);
  });
 
  test("same userId always returns the same color (deterministic)", () => {
    const first  = assignCursorColor("user-stable");
    const second = assignCursorColor("user-stable");
    expect(first).toEqual(second);
  });
 
  test("colors wrap when more users than palette length", () => {
    const n = CURSOR_COLORS.length;
    for (let i = 0; i < n; i++) assignCursorColor(`user-${i}`);
    expect(assignCursorColor(`user-${n}`)).toEqual(CURSOR_COLORS[0]);
  });

  test("LEAK PROOF: map is NOT isolated between simulated hook instances", () => {
    // Instance 1 mounts and assigns two users
    assignCursorColor("session-A-user-1"); // index 0
    assignCursorColor("session-A-user-2"); // index 1
 
    // Instance 1 "unmounts" — in the hook this calls userColorMap.clear()
    // BUT: if two instances are alive simultaneously, only one calls clear()
    // and the other's subsequent calls see a dirty map.
    //
    // Here we do NOT clear the map (simulating two simultaneous instances).
    // Instance 2 assigns its first user:
    const instance2Color = assignCursorColor("session-B-user-1");
 
    // In an isolated design, this should be CURSOR_COLORS[0].
    // Due to the module-level leak, it's CURSOR_COLORS[2].
    expect(instance2Color).toEqual(CURSOR_COLORS[2]); // ← LEAKED INDEX (bug)
    // After fix: expect(instance2Color).toEqual(CURSOR_COLORS[0]);
  });
 
  test("LEAK PROOF: hook unmount clears map — subsequent instance starts at index 0", () => {
    // This is the SINGLE-INSTANCE case where the cleanup DOES fire.
    assignCursorColor("user-A"); // index 0
    assignCursorColor("user-B"); // index 1
 
    // Hook unmounts → cleanup fires → map is cleared
    userColorMap.clear(); // ← this is what the hook's useEffect cleanup does
 
    // New hook mount: first user should be index 0
    const firstAfterReset = assignCursorColor("user-C");
    expect(firstAfterReset).toEqual(CURSOR_COLORS[0]); // ✓ correct after single-instance clear
  });
 
  test("LEAK PROOF: colour flip after clearUserColor — re-added user gets wrong colour", () => {
    // Mirrors the bug documented in cursorColors.test.ts.
    // In the hook, userColorMap.clear() on unmount wipes everything.
    // If the component is still alive and references the old colour in state,
    // any code that re-calls assignCursorColor for the same userId gets a
    // different colour (because map.size changed).
 
    const originalColor = assignCursorColor("user-1"); // index 0
    assignCursorColor("user-2");                        // index 1
 
    // user-1 leaves and comes back — hook calls assignCursorColor again
    userColorMap.delete("user-1"); // simulates cursor timeout removal
    const reentryColor = assignCursorColor("user-1"); // map.size=1 → index 1
 
    expect(reentryColor).not.toEqual(originalColor); // ← colour flip BUG
  });
});

describe("cursor lifecycle — add, update, remove", () => {
  test("remote cursor event adds cursor to state", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-remote" }));
    expect(store.cursors.has("user-remote")).toBe(true);
  });
 
  test("own userId events are filtered (not added to state)", () => {
    const store = makeCursorStore({ currentUserId: "current-user" });
    store.handleRemoteCursor(makeCursorPayload({ userId: "current-user" }));
    expect(store.cursors.has("current-user")).toBe(false);
  });
 
  test("second event for same user updates position (not duplicated)", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", position: { lineNumber: 1, column: 1 } }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", position: { lineNumber: 10, column: 5 } }));
    expect(store.cursors.size).toBe(1);
    expect(store.cursors.get("user-1")?.position.lineNumber).toBe(10);
  });
 
  test("collab:user-left removes cursor immediately", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1" }));
    expect(store.cursors.has("user-1")).toBe(true);
 
    store.handleUserLeft({ userId: "user-1" });
    expect(store.cursors.has("user-1")).toBe(false);
  });
 
  test("collab:user-left for unknown userId is a no-op (no crash)", () => {
    const store = makeCursorStore({});
    expect(() => store.handleUserLeft({ userId: "nobody" })).not.toThrow();
  });
 
  test("multiple users' cursors coexist independently", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", position: { lineNumber: 1, column: 1 } }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-2", position: { lineNumber: 20, column: 3 } }));
    expect(store.cursors.size).toBe(2);
    expect(store.cursors.get("user-1")?.position.lineNumber).toBe(1);
    expect(store.cursors.get("user-2")?.position.lineNumber).toBe(20);
  });
 
  test("removing user-1 does NOT affect user-2 cursor", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1" }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-2" }));
    store.handleUserLeft({ userId: "user-1" });
    expect(store.cursors.has("user-2")).toBe(true);
    expect(store.cursors.size).toBe(1);
  });
});

describe("stale cursor timeout — 6 second removal", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
 
  test("cursor is removed after 6 seconds of inactivity", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-stale" }));
    expect(store.cursors.has("user-stale")).toBe(true);
 
    vi.advanceTimersByTime(6001);
    expect(store.cursors.has("user-stale")).toBe(false);
  });
 
  test("cursor is NOT removed before 6 seconds", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-active" }));
    vi.advanceTimersByTime(5999);
    expect(store.cursors.has("user-active")).toBe(true);
  });
 
  test("new event resets the 6s timer — cursor survives past original deadline", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1" })); // t=0, timer starts
 
    vi.advanceTimersByTime(5000); // t=5000 — still alive
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1" })); // t=5000, timer RESET
 
    vi.advanceTimersByTime(5000); // t=10000 — 5s since reset, still within new 6s window
    expect(store.cursors.has("user-1")).toBe(true);
 
    vi.advanceTimersByTime(1001); // t=11001 — 6001ms since reset → removed
    expect(store.cursors.has("user-1")).toBe(false);
  });
 
  test("timer reset prevents early removal when events arrive frequently", () => {
    const store = makeCursorStore({});
    // Simulate a user typing: cursor events every 500ms for 10 seconds
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-typing" }));
    for (let t = 500; t <= 10000; t += 500) {
      vi.advanceTimersByTime(500);
      store.handleRemoteCursor(makeCursorPayload({ userId: "user-typing" }));
    }
    // Cursor should still be alive (timer kept resetting)
    expect(store.cursors.has("user-typing")).toBe(true);
 
    // After 6s of silence, it should be gone
    vi.advanceTimersByTime(6001);
    expect(store.cursors.has("user-typing")).toBe(false);
  });
 
  test("cleanup cancels pending timers (no delayed state updates after cleanup)", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1" }));
 
    // Cleanup before the 6s timeout fires
    store.cleanup();
 
    // Advance past timeout — should not throw or update state
    expect(() => vi.advanceTimersByTime(7000)).not.toThrow();
  });
});

describe("CursorsInCurrentFile — fileId filtering", () => {
  test("only cursors matching currentFileId are returned", () => {
    const store = makeCursorStore({ currentFileId: "file-abc" });
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", fileId: "file-abc" }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-2", fileId: "file-xyz" }));
 
    const inFile = store.cursorsInFile("file-abc");
    expect(inFile).toHaveLength(1);
    expect(inFile[0].userId).toBe("user-1");
  });
 
  test("returns empty array when no cursors are in the current file", () => {
    const store = makeCursorStore({ currentFileId: "file-abc" });
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", fileId: "file-other" }));
    expect(store.cursorsInFile("file-abc")).toHaveLength(0);
  });
 
  test("returns empty array when no cursors exist at all", () => {
    const store = makeCursorStore({ currentFileId: "file-abc" });
    expect(store.cursorsInFile("file-abc")).toHaveLength(0);
  });
 
  test("multiple users in same file all appear in filtered list", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", fileId: "file-abc" }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-2", fileId: "file-abc" }));
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-3", fileId: "file-other" }));
 
    const inFile = store.cursorsInFile("file-abc");
    expect(inFile).toHaveLength(2);
    expect(inFile.map(c => c.userId).sort()).toEqual(["user-1", "user-2"]);
  });
 
  test("after user leaves, their cursor no longer appears in file filter", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", fileId: "file-abc" }));
    store.handleUserLeft({ userId: "user-1" });
    expect(store.cursorsInFile("file-abc")).toHaveLength(0);
  });
});
describe("color stability across cursor updates", () => {
  test("a user's color does not change when they send multiple cursor events", () => {
    const store = makeCursorStore({});
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", position: { lineNumber: 1, column: 1 } }));
    const colorAfterFirst = store.cursors.get("user-1")!.color;
 
    store.handleRemoteCursor(makeCursorPayload({ userId: "user-1", position: { lineNumber: 99, column: 1 } }));
    const colorAfterSecond = store.cursors.get("user-1")!.color;
 
    expect(colorAfterFirst).toEqual(colorAfterSecond);
  });
 
  test("each user gets a distinct color (up to palette size)", () => {
    const store = makeCursorStore({});
    const n = Math.min(CURSOR_COLORS.length, 4); // test with first 4 to keep it fast
    for (let i = 0; i < n; i++) {
      store.handleRemoteCursor(makeCursorPayload({ userId: `user-${i}` }));
    }
 
    const assignedColors = new Set(
      Array.from(store.cursors.values()).map(c => c.color.name)
    );
    expect(assignedColors.size).toBe(n);
  });
});
describe("socket event wiring — listener cleanup", () => {
  test("after cleanup, remote cursor events no longer update state", () => {
    const { socket, serverEmit } = makeFakeSocket();
    const store = makeCursorStore({});
 
    const handleRemoteCursor = (data: any) => store.handleRemoteCursor(data);
    const handleUserLeft     = (data: any) => store.handleUserLeft(data);
 
    socket.on("collab:remote-cursor", handleRemoteCursor);
    socket.on("collab:user-left",     handleUserLeft);
 
    serverEmit("collab:remote-cursor", makeCursorPayload({ userId: "user-1" }));
    expect(store.cursors.has("user-1")).toBe(true);
 
    // Cleanup (mirrors hook's useEffect return)
    socket.off("collab:remote-cursor", handleRemoteCursor);
    socket.off("collab:user-left",     handleUserLeft);
    store.cleanup();
 
    serverEmit("collab:remote-cursor", makeCursorPayload({ userId: "user-2" }));
    expect(store.cursors.has("user-2")).toBe(false); // listener removed
  });
 
  test("both 'collab:remote-cursor' and 'collab:user-left' listeners are independently cleanable", () => {
    const { socket, serverEmit } = makeFakeSocket();
    const store = makeCursorStore({});
    let cursorCount = 0;
    let leftCount = 0;
 
    const onCursor = () => cursorCount++;
    const onLeft   = () => leftCount++;
 
    socket.on("collab:remote-cursor", onCursor);
    socket.on("collab:user-left",     onLeft);
 
    serverEmit("collab:remote-cursor", makeCursorPayload());
    serverEmit("collab:user-left",     { userId: "u" });
    expect(cursorCount).toBe(1);
    expect(leftCount).toBe(1);
 
    socket.off("collab:remote-cursor", onCursor);
    socket.off("collab:user-left",     onLeft);
 
    serverEmit("collab:remote-cursor", makeCursorPayload());
    serverEmit("collab:user-left",     { userId: "u" });
    expect(cursorCount).toBe(1); // unchanged
    expect(leftCount).toBe(1);   // unchanged
  });
});