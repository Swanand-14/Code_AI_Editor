// Pure decision functions extracted from the collab:join socket handler
//   No socket.io, no Prisma, no side-effects.
// The handler itself is NOT restructured (Option B); these functions are
// drop-in helpers that the handler can call instead of inlining the logic.

export type Role = "Host" | "Guest";
 
/**
 * Determines the role of a joining user purely from IDs.
 * No side-effects; safe to call multiple times.
 */
export function determineRole(hostId: string, userId: string): Role {
  return hostId === userId ? "Host" : "Guest";
}
 
/**
 * A minimal shape representing a connected socket in a room.
 * Mirrors the CollabSocket interface from the server but strips
 * all socket.io machinery so the logic is unit-testable.
 */
export interface RoomSocket {
  id: string;
  userId?: string;
  sessionId?: string;
}
 
/**
 * Returns true if at least one socket in the room belongs to the host.
 *
 * Mirrors this server logic verbatim:
 *   const hostPresent = socketsInRoom.some(socketId => {
 *     const s = io.sockets.sockets.get(socketId) as CollabSocket;
 *     return s?.userId === session.hostId;
 *   });
 *
 * The function receives the already-resolved RoomSocket objects (the server
 * resolves them via io.sockets.sockets.get).
 */
export function isHostPresent(socketsInRoom: RoomSocket[], hostId: string): boolean {
  return socketsInRoom.some(s => s.userId === hostId);
}
 
/**
 * Gate function that decides whether a guest should be allowed into the session.
 * Hosts bypass this check entirely — they are always allowed.
 *
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function shouldAllowGuest(
  role: Role,
  socketsInRoom: RoomSocket[],
  hostId: string,
): { allowed: true } | { allowed: false; reason: string } {
  if (role === "Host") {
    // Hosts are never gated — they create the presence that guests wait for.
    return { allowed: true };
  }
 
  if (!isHostPresent(socketsInRoom, hostId)) {
    return {
      allowed: false,
      reason: "HOST_NOT_PRESENT",
    };
  }
 
  return { allowed: true };
}
 
/**
 * Decides whether a "joined" activity log entry should be written.
 * Only fires on a genuinely new join, not on reconnects.
 *
 * Mirrors the server:
 *   if (isNewJoin) { logActivity(..., "joined", ...) }
 */
export function shouldLogJoinActivity(isNewJoin: boolean): boolean {
  return isNewJoin;
}
 
// ─── ORDERING CONTRACT (used in tests) ───────────────────────────────────────
//
// The correct handler execution order, expressed as a string enum so tests
// can assert which step happens when, without touching real sockets.
//
export const HandlerStep = {
  SESSION_VALIDATION:    "SESSION_VALIDATION",
  PARTICIPANT_GUARD:     "PARTICIPANT_GUARD",
  SOCKET_JOIN:           "SOCKET_JOIN",       // ← currently too early in live code
  HOST_PRESENCE_CHECK:   "HOST_PRESENCE_CHECK",
  ADD_PARTICIPANT:       "ADD_PARTICIPANT",
  BROADCAST:             "BROADCAST",
} as const;
 
export type HandlerStep = typeof HandlerStep[keyof typeof HandlerStep];
 
/**
 * Simulates the CURRENT (buggy) handler execution order from doc 6.
 * Returns the ordered steps actually taken, so tests can assert on them.
 *
 * This is NOT production code — it is a test fixture that mirrors the
 * live handler's control-flow so the ordering bug is machine-verifiable.
 */
export function simulateCurrentHandlerOrder(opts: {
  sessionValid: boolean;
  participantValid: boolean;
  role: Role;
  hostPresent: boolean;
}): HandlerStep[] {
  const steps: HandlerStep[] = [];
 
  // Step 1 — DB session validation
  steps.push(HandlerStep.SESSION_VALIDATION);
  if (!opts.sessionValid) return steps;
 
  // Step 2 — isValidParticipant guard
  steps.push(HandlerStep.PARTICIPANT_GUARD);
  if (!opts.participantValid) return steps;
 
  // Step 3 — socket.join  ← BUG: happens BEFORE host-presence check
  steps.push(HandlerStep.SOCKET_JOIN);
 
  // (guest block omitted in host path — mirrors live code)
  if (opts.role === "Guest") {
    // Step 4 — host-presence check (too late — socket already joined)
    steps.push(HandlerStep.HOST_PRESENCE_CHECK);
    if (!opts.hostPresent) return steps; // guest rejected, but already in room
  }
 
  // Step 5 — addParticipant + broadcast
  steps.push(HandlerStep.ADD_PARTICIPANT);
  steps.push(HandlerStep.BROADCAST);
 
  return steps;
}
 
/**
 * Simulates the CORRECT handler execution order (what the code should do).
 * Used as the reference in the ordering-contract test.
 */
export function simulateCorrectHandlerOrder(opts: {
  sessionValid: boolean;
  participantValid: boolean;
  role: Role;
  hostPresent: boolean;
}): HandlerStep[] {
  const steps: HandlerStep[] = [];
 
  steps.push(HandlerStep.SESSION_VALIDATION);
  if (!opts.sessionValid) return steps;
 
  steps.push(HandlerStep.PARTICIPANT_GUARD);
  if (!opts.participantValid) return steps;
 
  if (opts.role === "Guest") {
    // Host-presence check BEFORE socket.join — correct order
    steps.push(HandlerStep.HOST_PRESENCE_CHECK);
    if (!opts.hostPresent) return steps;
  }
 
  // socket.join only after all guards pass
  steps.push(HandlerStep.SOCKET_JOIN);
  steps.push(HandlerStep.ADD_PARTICIPANT);
  steps.push(HandlerStep.BROADCAST);
 
  return steps;
}