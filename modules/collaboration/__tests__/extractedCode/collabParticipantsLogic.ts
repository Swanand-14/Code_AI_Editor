// extractedCode/collabParticipantsLogic.ts
//
// Pure logic extracted from useCollabParticipants (doc 5).
// The hook wires these functions to React state; here they are standalone
// so we can test the dedup / bucketing / filtering logic without React.

export interface ParticipantInfo {
  userId: string;
  userName: string;
  userImage?: string;
  role: string;
  socketId: string;
  joinedAt: number;
  lastActivity: number;
  activeFile?: string;
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

// ─── Mirrors handleParticipantsUpdated from the hook ─────────────────────────

/**
 * Deduplicates a raw participant list by userId.
 * Last occurrence wins (matches Map behaviour).
 */
export function deduplicateParticipants(
  raw: ParticipantInfo[],
): ParticipantInfo[] {
  const map = new Map<string, ParticipantInfo>();
  raw.forEach(p => map.set(p.userId, p));
  return Array.from(map.values());
}

// ─── Mirrors handleParticipantActivity from the hook ─────────────────────────

/**
 * Applies an activity update to a participant list immutably.
 * Participants not matching userId are returned unchanged.
 */
export function applyParticipantActivity(
  participants: ParticipantInfo[],
  update: { userId: string; activeFile?: string; cursor?: any; lastActivity: number },
): ParticipantInfo[] {
  return participants.map(p =>
    p.userId === update.userId
      ? { ...p, activeFile: update.activeFile, cursor: update.cursor, lastActivity: update.lastActivity }
      : p,
  );
}

// ─── Mirrors the activityKey dedup in handleNewActivity ──────────────────────

/**
 * Builds the dedup key used by the CLIENT-SIDE hook.
 * Window: 2000ms (Math.floor(timestamp / 2000)).
 *
 * NOTE: The SERVER uses a 1000ms window.  This is the divergence.
 */
export function clientActivityKey(
  userId: string,
  action: string,
  timestamp: number,
): string {
  return `${userId}-${action}-${Math.floor(timestamp / 2000)}`;
}

/**
 * Builds the dedup key used by the SERVER (participantState.ts).
 * Window: 1000ms (Math.floor(timestamp / 1000) * 1000).
 */
export function serverActivityKey(
  userId: string,
  action: string,
  timestamp: number,
): string {
  const bucket = Math.floor(timestamp / 1000) * 1000;
  return `${userId}-${action}-${bucket}`;
}

// ─── Mirrors shouldSkipNewActivity from handleNewActivity ────────────────────

/**
 * Returns true if the activity should be skipped (duplicate or own event).
 *
 * Rules mirrored verbatim from the hook:
 *   1. Skip if activity.userId === currentUserId
 *   2. Skip if recentActivityIds already has the entry id
 *   3. Skip if the 2s-bucket activityKey already exists in recent entries
 */
export function shouldSkipActivity(
  activity: ActivityLogEntry,
  currentUserId: string | undefined,
  recentIds: Set<string>,
  recentEntries: ActivityLogEntry[], // only first 5 are checked per hook source
): boolean {
  // Rule 1: own events are always skipped
  if (activity.userId === currentUserId) return true;

  // Rule 2: exact id duplicate
  if (recentIds.has(activity.id)) return true;

  // Rule 3: 2s-bucket key collision
  const incomingKey = clientActivityKey(activity.userId, activity.action, activity.timestamp);
  const hasSimilar = recentEntries.slice(0, 5).some(existing => {
    const existingKey = clientActivityKey(existing.userId, existing.action, existing.timestamp);
    return existingKey === incomingKey;
  });

  return hasSimilar;
}

// ─── Mirrors recentActivityIds cleanup (keep last 100) ───────────────────────

/**
 * Trims the recentIds set to at most maxSize entries (oldest removed).
 * Mutates the set in place — mirrors the hook's behaviour.
 */
export function trimRecentIds(ids: Set<string>, maxSize = 100): void {
  if (ids.size > maxSize) {
    const oldIds = Array.from(ids).slice(0, ids.size - maxSize);
    oldIds.forEach(id => ids.delete(id));
  }
}