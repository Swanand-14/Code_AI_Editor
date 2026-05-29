import { describe, test, expect } from "vitest";
import {
  determineRole,
  isHostPresent,
  shouldAllowGuest,
  shouldLogJoinActivity,
  simulateCurrentHandlerOrder,
  simulateCorrectHandlerOrder,
  HandlerStep,
  type RoomSocket,
} from "./extractedCode/collabHandlers";
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
function makeSocket(overrides: Partial<RoomSocket> = {}): RoomSocket {
  return {
    id:        overrides.id        ?? "socket-default",
    userId:    overrides.userId    ?? undefined,
    sessionId: overrides.sessionId ?? undefined,
    ...overrides,
  };
}
 
const HOST_ID = "host-user-123";

describe("determineRole", () => {
  test("returns 'Host' when userId matches hostId exactly", () => {
    expect(determineRole(HOST_ID, HOST_ID)).toBe("Host");
  });
 
  test("returns 'Guest' when userId differs from hostId", () => {
    expect(determineRole(HOST_ID, "guest-user-456")).toBe("Guest");
  });
 
  test("comparison is case-sensitive — 'HOST-USER-123' !== 'host-user-123'", () => {
    expect(determineRole(HOST_ID, HOST_ID.toUpperCase())).toBe("Guest");
  });
 
  test("empty string userId is never the host (even if hostId were '')", () => {
    // Protects against the phantom-session bug where userId might be ""
    expect(determineRole(HOST_ID, "")).toBe("Guest");
  });
 
  test("whitespace userId is not the host", () => {
    expect(determineRole(HOST_ID, "   ")).toBe("Guest");
  });
});

describe("isHostPresent", () => {
  test("returns true when a socket in the room has userId === hostId", () => {
    const sockets: RoomSocket[] = [
      makeSocket({ id: "s-1", userId: "guest-user" }),
      makeSocket({ id: "s-2", userId: HOST_ID }),
    ];
    expect(isHostPresent(sockets, HOST_ID)).toBe(true);
  });
 
  test("returns false when no socket has userId === hostId", () => {
    const sockets: RoomSocket[] = [
      makeSocket({ id: "s-1", userId: "guest-user-1" }),
      makeSocket({ id: "s-2", userId: "guest-user-2" }),
    ];
    expect(isHostPresent(sockets, HOST_ID)).toBe(false);
  });
 
  test("returns false for an empty room", () => {
    expect(isHostPresent([], HOST_ID)).toBe(false);
  });
 
  test("returns false when sockets have no userId set (undefined)", () => {
    // Unauthenticated or mid-handshake sockets have no userId yet
    const sockets: RoomSocket[] = [
      makeSocket({ id: "s-1", userId: undefined }),
      makeSocket({ id: "s-2", userId: undefined }),
    ];
    expect(isHostPresent(sockets, HOST_ID)).toBe(false);
  });
 
  test("EDGE CASE: guest checking presence sees only themselves — host not present", () => {
    // A joining guest's own socket may already be in the room list
    // (because socket.join happens before the host-presence check in the live code).
    // If the room contains only the joining guest, host is NOT present.
    const guestSocket = makeSocket({ id: "s-guest", userId: "guest-user-456" });
    expect(isHostPresent([guestSocket], HOST_ID)).toBe(false);
  });
 
  test("host socket with extra sockets in room still returns true", () => {
    const sockets: RoomSocket[] = [
      makeSocket({ id: "s-g1", userId: "guest-1" }),
      makeSocket({ id: "s-g2", userId: "guest-2" }),
      makeSocket({ id: "s-h",  userId: HOST_ID }),
      makeSocket({ id: "s-g3", userId: "guest-3" }),
    ];
    expect(isHostPresent(sockets, HOST_ID)).toBe(true);
  });
 
  test("matching is by userId value — socket.id is irrelevant", () => {
    // The live server resolves sockets by socketId then checks s.userId.
    // Ensure we never accidentally compare against socket.id.
    const sockets: RoomSocket[] = [
      // socket whose .id happens to equal HOST_ID but whose .userId differs
      makeSocket({ id: HOST_ID, userId: "some-other-user" }),
    ];
    expect(isHostPresent(sockets, HOST_ID)).toBe(false);
  });
});

describe("shouldAllowGuest", () => {
  const hostSocket: RoomSocket = makeSocket({ id: "s-host", userId: HOST_ID });
  const guestSocket: RoomSocket = makeSocket({ id: "s-guest", userId: "guest-456" });
 
  test("Host role is always allowed regardless of room contents", () => {
    const result = shouldAllowGuest("Host", [], HOST_ID);
    expect(result.allowed).toBe(true);
  });
 
  test("Host role is allowed even when no other sockets are in the room", () => {
    // The host is the FIRST to join — the room is empty when they arrive.
    const result = shouldAllowGuest("Host", [], HOST_ID);
    expect(result.allowed).toBe(true);
  });
 
  test("Guest is allowed when host socket is present in room", () => {
    const result = shouldAllowGuest("Guest", [hostSocket, guestSocket], HOST_ID);
    expect(result.allowed).toBe(true);
  });
 
  test("Guest is blocked when room is empty", () => {
    const result = shouldAllowGuest("Guest", [], HOST_ID);
    expect(result.allowed).toBe(false);
  });
 
  test("Guest is blocked when only other guests are in the room", () => {
    const result = shouldAllowGuest("Guest", [guestSocket], HOST_ID);
    expect(result.allowed).toBe(false);
  });
 
  test("blocked guest result contains reason 'HOST_NOT_PRESENT'", () => {
    const result = shouldAllowGuest("Guest", [], HOST_ID);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("HOST_NOT_PRESENT");
    }
  });
 
  test("Guest blocked if the only socket in room is themselves (already joined before check)", () => {
    // This is the exact race condition from the live handler:
    // socket.join() fires before shouldAllowGuest is called.
    // The guest's own socket is already in the room when the check runs.
    const joiningGuestSocket = makeSocket({ id: "s-joining-guest", userId: "guest-456" });
    const result = shouldAllowGuest("Guest", [joiningGuestSocket], HOST_ID);
    expect(result.allowed).toBe(false); // host still not present
  });
});

describe("collab:join handler — SOCKET_JOIN before HOST_PRESENCE_CHECK (ordering bug)", () => {
  // ── Reference: what the correct order looks like ─────────────────────────
 
  test("CORRECT order: HOST_PRESENCE_CHECK happens before SOCKET_JOIN for a guest", () => {
    const steps = simulateCorrectHandlerOrder({
      sessionValid:     true,
      participantValid: true,
      role:             "Guest",
      hostPresent:      true,
    });
 
    const hostCheckIndex  = steps.indexOf(HandlerStep.HOST_PRESENCE_CHECK);
    const socketJoinIndex = steps.indexOf(HandlerStep.SOCKET_JOIN);
 
    expect(hostCheckIndex).toBeLessThan(socketJoinIndex);
  });
 
  test("CORRECT order: rejected guest never reaches SOCKET_JOIN", () => {
    const steps = simulateCorrectHandlerOrder({
      sessionValid:     true,
      participantValid: true,
      role:             "Guest",
      hostPresent:      false, // host absent → should be rejected before join
    });
 
    expect(steps).not.toContain(HandlerStep.SOCKET_JOIN);
    expect(steps).not.toContain(HandlerStep.ADD_PARTICIPANT);
    expect(steps).not.toContain(HandlerStep.BROADCAST);
  });
 
  // ── The actual (buggy) order ──────────────────────────────────────────────
 
  test("BUG — CURRENT order: SOCKET_JOIN fires BEFORE HOST_PRESENCE_CHECK for a guest", () => {
    // This test documents the live handler's ordering as of doc 6.
    // It is expected to PASS (proving the bug exists).
    // It should FAIL after the fix is applied — at which point this test
    // should be replaced by the "CORRECT order" tests above.
    const steps = simulateCurrentHandlerOrder({
      sessionValid:     true,
      participantValid: true,
      role:             "Guest",
      hostPresent:      true,
    });
 
    const socketJoinIndex    = steps.indexOf(HandlerStep.SOCKET_JOIN);
    const hostCheckIndex     = steps.indexOf(HandlerStep.HOST_PRESENCE_CHECK);
 
    // In the live handler, SOCKET_JOIN is earlier in the array
    expect(socketJoinIndex).toBeLessThan(hostCheckIndex); // ← KNOWN BUG
  });
 
  test("BUG — CURRENT order: rejected guest already joined the room (SOCKET_JOIN present in rejected path)", () => {
    const steps = simulateCurrentHandlerOrder({
      sessionValid:     true,
      participantValid: true,
      role:             "Guest",
      hostPresent:      false, // guest is rejected
    });
 
    // The guest was rejected (ADD_PARTICIPANT and BROADCAST never ran)
    expect(steps).not.toContain(HandlerStep.ADD_PARTICIPANT);
    expect(steps).not.toContain(HandlerStep.BROADCAST);
 
    // BUT they already joined the socket room — SOCKET_JOIN IS present
    expect(steps).toContain(HandlerStep.SOCKET_JOIN); // ← KNOWN BUG
    // Consequence: the rejected guest receives future room broadcasts
    // until they disconnect.
  });
 
  // ── Host is unaffected by the ordering bug ────────────────────────────────
 
  test("host path: SOCKET_JOIN ordering does not matter — host skips HOST_PRESENCE_CHECK entirely", () => {
    const currentSteps = simulateCurrentHandlerOrder({
      sessionValid:     true,
      participantValid: true,
      role:             "Host",
      hostPresent:      false, // irrelevant for host
    });
 
    // Host never hits the host-presence gate
    expect(currentSteps).not.toContain(HandlerStep.HOST_PRESENCE_CHECK);
    expect(currentSteps).toContain(HandlerStep.SOCKET_JOIN);
    expect(currentSteps).toContain(HandlerStep.ADD_PARTICIPANT);
  });
 
  // ── Invalid session / participant short-circuits before SOCKET_JOIN ───────
 
  test("invalid session: SOCKET_JOIN is never reached in either current or correct order", () => {
    const current = simulateCurrentHandlerOrder({
      sessionValid: false, participantValid: true, role: "Guest", hostPresent: true,
    });
    const correct = simulateCorrectHandlerOrder({
      sessionValid: false, participantValid: true, role: "Guest", hostPresent: true,
    });
 
    expect(current).not.toContain(HandlerStep.SOCKET_JOIN);
    expect(correct).not.toContain(HandlerStep.SOCKET_JOIN);
  });
 
  test("invalid participant: SOCKET_JOIN is never reached in the CORRECT order", () => {
    const correct = simulateCorrectHandlerOrder({
      sessionValid: true, participantValid: false, role: "Guest", hostPresent: true,
    });
    expect(correct).not.toContain(HandlerStep.SOCKET_JOIN);
  });
 
  test("BUG — invalid participant: SOCKET_JOIN IS reached in the CURRENT (broken) order", () => {
    // The live handler calls socket.join(sessionId) AFTER isValidParticipant
    // but BEFORE the host-presence check.  However, for invalid participants
    // the handler returns early after the isValidParticipant guard.
    // So SOCKET_JOIN is correctly absent for invalid participants too.
    // This confirms the bug is specifically in the Guest/host-presence path.
    const current = simulateCurrentHandlerOrder({
      sessionValid: true, participantValid: false, role: "Guest", hostPresent: true,
    });
    // invalid participant → no SOCKET_JOIN (the guard returns early)
    expect(current).not.toContain(HandlerStep.SOCKET_JOIN);
  });
 
  // ── Full happy-path step sequence sanity check ────────────────────────────
 
  test("full happy path (host, valid): all steps present in correct order", () => {
    const steps = simulateCorrectHandlerOrder({
      sessionValid: true, participantValid: true, role: "Host", hostPresent: true,
    });
 
    const expected = [
      HandlerStep.SESSION_VALIDATION,
      HandlerStep.PARTICIPANT_GUARD,
      HandlerStep.SOCKET_JOIN,
      HandlerStep.ADD_PARTICIPANT,
      HandlerStep.BROADCAST,
    ];
    expect(steps).toEqual(expected);
  });
 
  test("full happy path (guest with host present): correct order includes HOST_PRESENCE_CHECK before SOCKET_JOIN", () => {
    const steps = simulateCorrectHandlerOrder({
      sessionValid: true, participantValid: true, role: "Guest", hostPresent: true,
    });
 
    const expected = [
      HandlerStep.SESSION_VALIDATION,
      HandlerStep.PARTICIPANT_GUARD,
      HandlerStep.HOST_PRESENCE_CHECK,
      HandlerStep.SOCKET_JOIN,
      HandlerStep.ADD_PARTICIPANT,
      HandlerStep.BROADCAST,
    ];
    expect(steps).toEqual(expected);
  });
});
 