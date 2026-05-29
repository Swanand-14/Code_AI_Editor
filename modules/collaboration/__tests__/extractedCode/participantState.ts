// ─────────────────────────────────────────────────────────────────────────────
// participantState.ts
// Pure state-management functions extracted from your socket server (doc 1).
// These are the exact algorithms from the server file with I/O side-effects
// (Prisma, socket.io) stripped so they are unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParticipantInfo {
  userId: string;
  userName: string;
  userImage?: string;
  role: string;
  socketId: string;
  joinedAt: number;
  lastActivity: number;
  activeFile?: string;
  socketIds: Set<string>;
  cursor?: {
    fileId: string;
    position: { lineNumber: number; column: number };
  };
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
  timestamp: number;
  fileId?: string;
  filePath?: string;
}

// ── Module-level maps (mirrors the server) ───────────────────────────────────
export const sessionParticipants = new Map<string, Map<string, ParticipantInfo>>();
export const sessionActivityLogs = new Map<string, ActivityLogEntry[]>();
export const recentActivityIds    = new Map<string, Set<string>>();

/** Wipes all state — call in beforeEach */
export function resetAllState(): void {
  sessionParticipants.clear();
  sessionActivityLogs.clear();
  recentActivityIds.clear();
}

// ── isValidParticipant ────────────────────────────────────────────────────────
export function isValidParticipant(userId?: string, userName?: string): boolean {
  if (!userId || !userName) return false;
  if (userName === "Anonymous") return false;
  if (userId.startsWith("guest-")) return false;
  return true;
}

// ── serializeParticipant ─────────────────────────────────────────────────────
export function serializeParticipant(p: ParticipantInfo) {
  return {
    userId:       p.userId,
    userName:     p.userName,
    userImage:    p.userImage,
    role:         p.role,
    socketId:     Array.from(p.socketIds)[0],
    joinedAt:     p.joinedAt,
    lastActivity: p.lastActivity,
    activeFile:   p.activeFile,
    cursor:       p.cursor,
  };
}

// ── addParticipant ────────────────────────────────────────────────────────────
/** Returns true when the user is BRAND NEW to the session. */
export function addParticipant(sessionId: string, participant: ParticipantInfo): boolean {
  if (!sessionParticipants.has(sessionId)) {
    sessionParticipants.set(sessionId, new Map());
  }

  const participants = sessionParticipants.get(sessionId)!;
  const existing     = participants.get(participant.userId);

  if (existing) {
    const newSocketId = Array.from(participant.socketIds)[0];
    const isNewSocket = !existing.socketIds.has(newSocketId);

    if (isNewSocket) {
      participant.socketIds.forEach((s) => existing.socketIds.add(s));
      existing.lastActivity = Date.now();
      existing.userName     = participant.userName;
      existing.userImage    = participant.userImage ?? existing.userImage;
    }
    return false; // Not a new join
  }

  participants.set(participant.userId, participant);
  return true;
}

// ── removeParticipant ─────────────────────────────────────────────────────────
export function removeParticipant(
  sessionId: string,
  socketId: string
): { participant: ParticipantInfo | null; wasLastConnection: boolean } {
  const participants = sessionParticipants.get(sessionId);
  if (!participants) return { participant: null, wasLastConnection: false };

  let foundParticipant: ParticipantInfo | null = null;
  let wasLastConnection = false;

  for (const [userId, participant] of participants.entries()) {
    if (participant.socketIds.has(socketId)) {
      foundParticipant = participant;
      participant.socketIds.delete(socketId);

      if (participant.socketIds.size === 0) {
        participants.delete(userId);
        wasLastConnection = true;
      }
      break;
    }
  }

  return { participant: foundParticipant, wasLastConnection };
}

// ── getParticipants ───────────────────────────────────────────────────────────
export function getParticipants(sessionId: string) {
  const participants = sessionParticipants.get(sessionId);
  if (!participants) return [];
  return Array.from(participants.values()).map(serializeParticipant);
}

// ── isActivityDuplicate ───────────────────────────────────────────────────────
export function isActivityDuplicate(sessionId: string, activityId: string): boolean {
  if (!recentActivityIds.has(sessionId)) {
    recentActivityIds.set(sessionId, new Set());
  }

  const ids = recentActivityIds.get(sessionId)!;
  if (ids.has(activityId)) return true;

  ids.add(activityId);

  if (ids.size > 100) {
    const oldIds = Array.from(ids).slice(0, ids.size - 100);
    oldIds.forEach((id) => ids.delete(id));
  }

  return false;
}

// ── logActivity ───────────────────────────────────────────────────────────────
export function logActivity(
  sessionId: string,
  userId: string,
  userName: string,
  action: string,
  details?: string,
  fileId?: string,
  filePath?: string
): ActivityLogEntry | null {
  if (!sessionActivityLogs.has(sessionId)) {
    sessionActivityLogs.set(sessionId, []);
  }

  const logs             = sessionActivityLogs.get(sessionId)!;
  const timestamp        = Date.now();
  const timestampSecond  = Math.floor(timestamp / 1000) * 1000;
  const activityId       = `${userId}-${action}-${timestampSecond}`;

  if (isActivityDuplicate(sessionId, activityId)) return null;

  const entry: ActivityLogEntry = {
    id: `${timestamp}-${userId}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    userName,
    action,
    details,
    timestamp,
    fileId,
    filePath,
  };

  logs.unshift(entry);
  if (logs.length > 50) logs.length = 50;

  return entry;
}

export function getActivityLogs(sessionId: string): ActivityLogEntry[] {
  return sessionActivityLogs.get(sessionId) || [];
}