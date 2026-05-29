import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, useCallback, useState } from "react";
 
// ─── Minimal reproductions of the two hook patterns ──────────────────────────
 
/**
 * CORRECT pattern — ref-based (mirrors emitCursorMove in useCollabSocket).
 * The callback never goes stale because it always reads ref.current.
 */
function useRefBasedEmit(sessionId: string) {
  const socketRef = useRef<{ emit: (event: string, data: any) => void } | null>(null);
 
  // Mirrors: emitCursorMove = useCallback(payload => socketRef.current?.emit(...), [sessionId])
  const emit = useCallback((data: any) => {
    socketRef.current?.emit("cursor:move", { sessionId, ...data });
  }, [sessionId]);
 
  const setSocket = (s: typeof socketRef.current) => {
    socketRef.current = s;
  };
 
  return { emit, setSocket, socketRef };
}
 
/**
 * BUGGY pattern — state-based (mirrors emitWebContainerCommand in useCollabSocket).
 * The callback captures the `socket` state value at render time.
 */
function useStateBasedEmit(sessionId: string) {
  const [socket, setSocket] = useState<{ emit: (event: string, data: any) => void } | null>(null);
 
  // Mirrors: emitWebContainerCommand = useCallback(cmd => socket?.emit(...), [socket, sessionId])
  const emit = useCallback((command: string) => {
    socket?.emit("webcontainer:command", { sessionId, command });
  }, [socket, sessionId]); // `socket` in deps → re-created on every socket change
 
  return { emit, setSocket, socket };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("ref-based emit (emitCursorMove pattern) — CORRECT behaviour", () => {
  test("emit calls through to the current socket after it is set", () => {
    const { result } = renderHook(() => useRefBasedEmit("session-1"));
 
    const mockSocket = { emit: vi.fn() };
    act(() => { result.current.setSocket(mockSocket); });
 
    act(() => { result.current.emit({ fileId: "f-1", position: { lineNumber: 5, column: 1 } }); });
 
    expect(mockSocket.emit).toHaveBeenCalledOnce();
    expect(mockSocket.emit).toHaveBeenCalledWith("cursor:move", expect.objectContaining({
      sessionId: "session-1",
    }));
  });
 
  test("emit captured BEFORE socket is set still works AFTER socket is set", () => {
    // Prove the ref pattern: capture emit early, set socket later, call still works.
    const { result } = renderHook(() => useRefBasedEmit("session-1"));
 
    // Capture the emit function reference at mount (socket is null)
    const capturedEmit = result.current.emit;
 
    const mockSocket = { emit: vi.fn() };
    act(() => { result.current.setSocket(mockSocket); });
 
    // Call the CAPTURED (early) reference — should still work
    act(() => { capturedEmit({ fileId: "f-1", position: { lineNumber: 1, column: 1 } }); });
 
    expect(mockSocket.emit).toHaveBeenCalledOnce(); // ✓ ref pattern always fresh
  });
 
  test("after socket replacement (reconnect), captured emit calls through to NEW socket", () => {
    const { result } = renderHook(() => useRefBasedEmit("session-1"));
 
    const oldSocket = { emit: vi.fn() };
    const newSocket = { emit: vi.fn() };
 
    act(() => { result.current.setSocket(oldSocket); });
    const capturedEmit = result.current.emit; // capture before reconnect
 
    // Reconnect: replace socket in ref
    act(() => { result.current.setSocket(newSocket); });
 
    // Call the captured reference — it should hit the NEW socket
    act(() => { capturedEmit({ fileId: "f-1", position: { lineNumber: 1, column: 1 } }); });
 
    expect(oldSocket.emit).not.toHaveBeenCalled(); // old socket NOT called
    expect(newSocket.emit).toHaveBeenCalledOnce(); // new socket called ✓
  });
 
  test("emit is a stable reference — does not change when socket changes", () => {
    const { result } = renderHook(() => useRefBasedEmit("session-1"));
    const firstEmit = result.current.emit;
 
    const mockSocket = { emit: vi.fn() };
    act(() => { result.current.setSocket(mockSocket); });
 
    // useCallback deps are [sessionId] only — changing the socket does not
    // create a new function reference
    expect(result.current.emit).toBe(firstEmit); // ✓ stable reference
  });
});

describe("state-based emit (emitWebContainerCommand pattern) — STALE CLOSURE BUG", () => {
  test("BUG: emit captured BEFORE socket is set does NOT work after socket is set", () => {
    // This is the stale closure proof.
    // The emit function closes over the `socket` STATE value at the time
    // useCallback ran.  If you capture emit when socket=null, that captured
    // function will always call null?.emit(...) — a no-op — even after the
    // socket state has been updated.
    const { result } = renderHook(() => useStateBasedEmit("session-1"));
 
    // Capture emit reference when socket is null (before connection)
    const capturedEmit = result.current.emit;
 
    const mockSocket = { emit: vi.fn() };
    act(() => { result.current.setSocket(mockSocket); });
 
    // Call the CAPTURED (stale) reference
    act(() => { capturedEmit("start"); });
 
    // The stale closure calls null?.emit() — nothing happens
    expect(mockSocket.emit).not.toHaveBeenCalled(); // ← STALE CLOSURE BUG
 
    // But the CURRENT emit (after re-render) DOES work:
    act(() => { result.current.emit("start"); });
    expect(mockSocket.emit).toHaveBeenCalledOnce(); // fresh reference works
  });
  test("emit IS a new reference after socket state changes (useCallback re-creates)", () => {
    // This is why the bug is subtle: the hook DOES produce a new function after
    // reconnect — but any caller holding the old reference is already stale.
    const { result } = renderHook(() => useStateBasedEmit("session-1"));
    const firstEmit = result.current.emit;
 
    const mockSocket = { emit: vi.fn() };
    act(() => { result.current.setSocket(mockSocket); });
 
    // socket changed → useCallback re-ran → new function reference
    expect(result.current.emit).not.toBe(firstEmit); // ← confirms re-creation
 
    // The OLD reference is now stale.  Any component that captured it
    // (e.g., in an event handler that wasn't re-registered) will miss the update.
  });
});


 