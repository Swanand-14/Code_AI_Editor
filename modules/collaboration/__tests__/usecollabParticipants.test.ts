import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  deduplicateParticipants,
  applyParticipantActivity,
  clientActivityKey,
  serverActivityKey,
  shouldSkipActivity,
  trimRecentIds,
  type ParticipantInfo,
  type ActivityLogEntry,
} from "./extractedCode/collabParticipantsLogic";
import { makeFakeSocket } from "./extractedCode/FakeSocket";
function makeParticipant(overrides: Partial<ParticipantInfo> = {}): ParticipantInfo {
  return {
    userId:       "user-1",
    userName:     "Alice",
    role:         "Guest",
    socketId:     "s-1",
    joinedAt:     Date.now(),
    lastActivity: Date.now(),
    ...overrides,
  };
}
 
function makeActivity(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id:        `act-${Math.random().toString(36).slice(2)}`,
    userId:    "user-1",
    userName:  "Alice",
    action:    "joined",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("deduplicateParticipants", () => {
  test("removes duplicate userIds — last entry wins", () => {
    const raw = [
      makeParticipant({ userId: "user-1", userName: "Alice-old" }),
      makeParticipant({ userId: "user-2", userName: "Bob" }),
      makeParticipant({ userId: "user-1", userName: "Alice-new" }),
    ];
    const result = deduplicateParticipants(raw);
    expect(result).toHaveLength(2);
    const alice = result.find(p => p.userId === "user-1");
    expect(alice?.userName).toBe("Alice-new");
  });
 
  test("returns all entries when all userIds are unique", () => {
    const raw = [
      makeParticipant({ userId: "user-1" }),
      makeParticipant({ userId: "user-2" }),
      makeParticipant({ userId: "user-3" }),
    ];
    expect(deduplicateParticipants(raw)).toHaveLength(3);
  });
 
  test("empty array → empty array", () => {
    expect(deduplicateParticipants([])).toHaveLength(0);
  });
 
  test("single entry is returned as-is", () => {
    const p = makeParticipant({ userId: "user-1", userName: "Solo" });
    const result = deduplicateParticipants([p]);
    expect(result).toHaveLength(1);
    expect(result[0].userName).toBe("Solo");
  });
 
  test("three duplicates of same userId: only last survives", () => {
    const raw = [
      makeParticipant({ userId: "user-1", userName: "v1" }),
      makeParticipant({ userId: "user-1", userName: "v2" }),
      makeParticipant({ userId: "user-1", userName: "v3" }),
    ];
    const result = deduplicateParticipants(raw);
    expect(result).toHaveLength(1);
    expect(result[0].userName).toBe("v3");
  });
});

describe("applyParticipantActivity", () => {
  test("updates only the matching participant", () => {
    const participants = [
      makeParticipant({ userId: "user-1", userName: "Alice", activeFile: "old.ts" }),
      makeParticipant({ userId: "user-2", userName: "Bob",   activeFile: "bob.ts" }),
    ];
    const update = { userId: "user-1", activeFile: "new.ts", lastActivity: 9999 };
    const result = applyParticipantActivity(participants, update);
 
    expect(result.find(p => p.userId === "user-1")?.activeFile).toBe("new.ts");
    expect(result.find(p => p.userId === "user-2")?.activeFile).toBe("bob.ts"); // unchanged
  });
 
  test("userId not in list → all participants returned unchanged", () => {
    const participants = [makeParticipant({ userId: "user-1", activeFile: "a.ts" })];
    const result = applyParticipantActivity(participants, {
      userId: "user-unknown", activeFile: "b.ts", lastActivity: 0,
    });
    expect(result[0].activeFile).toBe("a.ts");
  });
 
  test("cursor field is updated correctly", () => {
    const participants = [makeParticipant({ userId: "user-1" })];
    const cursor = { fileId: "file-1", position: { lineNumber: 10, column: 5 } };
    const result = applyParticipantActivity(participants, {
      userId: "user-1", cursor, lastActivity: Date.now(),
    });
    expect(result[0].cursor).toEqual(cursor);
  });
 
  test("returns a NEW array (immutable update)", () => {
    const participants = [makeParticipant({ userId: "user-1" })];
    const result = applyParticipantActivity(participants, {
      userId: "user-1", activeFile: "new.ts", lastActivity: 0,
    });
    expect(result).not.toBe(participants);
  });
 
  test("other participant objects are not mutated (referential check)", () => {
    const bob = makeParticipant({ userId: "user-2", userName: "Bob" });
    const participants = [makeParticipant({ userId: "user-1" }), bob];
    const result = applyParticipantActivity(participants, {
      userId: "user-1", activeFile: "x.ts", lastActivity: 0,
    });
    // Bob's object reference is preserved (not cloned unless necessary)
    expect(result.find(p => p.userId === "user-2")).toBe(bob);
  });
});

describe("shouldSkipActivity", () => {
    const CURRENT_USER = "current-user-id";
 
  test("own-user events are always skipped", () => {
    const activity = makeActivity({ userId: CURRENT_USER });
    expect(shouldSkipActivity(activity, CURRENT_USER, new Set(), [])).toBe(true);
  });
 
  test("own-user events are skipped even if they have a unique id", () => {
    const activity = makeActivity({ userId: CURRENT_USER, id: "brand-new-id" });
    expect(shouldSkipActivity(activity, CURRENT_USER, new Set(), [])).toBe(true);
  });
 
  test("exact id duplicate is skipped", () => {
    const activity = makeActivity({ userId: "user-2", id: "known-id" });
    const recentIds = new Set(["known-id"]);
    expect(shouldSkipActivity(activity, CURRENT_USER, recentIds, [])).toBe(true);
  });
 
  test("2s-bucket key collision is skipped (checks first 5 recent entries)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000); // t=1000ms → client bucket = 0
 
    const existing = makeActivity({
      userId: "user-2", action: "edited", timestamp: 1000, id: "existing-id",
    });
    const incoming = makeActivity({
      userId: "user-2", action: "edited", timestamp: 1500, id: "incoming-id", // still bucket 0
    });
 
    expect(
      shouldSkipActivity(incoming, CURRENT_USER, new Set(), [existing])
    ).toBe(true);
 
    vi.useRealTimers();
  });
  test("different users with same action in same 2s bucket are NOT duplicates of each other", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
 
    const user1Entry = makeActivity({ userId: "user-1", action: "joined", timestamp: 1000 });
    const user2Activity = makeActivity({ userId: "user-2", action: "joined", timestamp: 1200 });
 
    // user-2's "joined" is NOT a duplicate of user-1's "joined"
    expect(
      shouldSkipActivity(user2Activity, CURRENT_USER, new Set(), [user1Entry])
    ).toBe(false);
 
    vi.useRealTimers();
  });
 
  test("same user, different action in same 2s bucket — NOT a duplicate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
 
    const existing = makeActivity({ userId: "user-2", action: "joined",      timestamp: 1000 });
    const incoming = makeActivity({ userId: "user-2", action: "edited file", timestamp: 1200 });
 
    expect(
      shouldSkipActivity(incoming, CURRENT_USER, new Set(), [existing])
    ).toBe(false);
 
    vi.useRealTimers();
  });

  test("completely new activity from another user is not skipped", () => {
    const activity = makeActivity({ userId: "user-other", action: "joined", timestamp: Date.now() });
    expect(shouldSkipActivity(activity, CURRENT_USER, new Set(), [])).toBe(false);
  });
 
  test("currentUserId=undefined: own-user filter does not fire (no current user set)", () => {
    // If currentUserId is undefined (e.g., auth not yet loaded), no events
    // should be filtered by the own-user rule.
    const activity = makeActivity({ userId: "user-1" });
    expect(shouldSkipActivity(activity, undefined, new Set(), [])).toBe(false);
  });
})

describe("trimRecentIds", () => {
  test("does nothing when size <= maxSize", () => {
    const ids = new Set(["a", "b", "c"]);
    trimRecentIds(ids, 100);
    expect(ids.size).toBe(3);
  });
 
  test("trims to exactly maxSize when over limit", () => {
    const ids = new Set(Array.from({ length: 101 }, (_, i) => `id-${i}`));
    trimRecentIds(ids, 100);
    expect(ids.size).toBe(100);
  });
 
  test("removes oldest entries (insertion order)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 101; i++) ids.add(`id-${i}`);
    trimRecentIds(ids, 100);
 
    // id-0 (oldest) should be gone
    expect(ids.has("id-0")).toBe(false);
    // id-1 through id-100 remain
    expect(ids.has("id-1")).toBe(true);
    expect(ids.has("id-100")).toBe(true);
  });
 
  test("trimmed id is no longer considered a duplicate (can be re-added)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 101; i++) ids.add(`id-${i}`);
    trimRecentIds(ids, 100);
 
    // id-0 was trimmed — it should be re-addable without being treated as dup
    expect(ids.has("id-0")).toBe(false);
    ids.add("id-0");
    expect(ids.has("id-0")).toBe(true); // successfully re-added
  });
});

// These tests wire the fake socket to functions that mirror the hook's
// event handlers, validating the full receive → process → state flow.
// ─────────────────────────────────────────────────────────────────────────────

describe("socket event integration — participants-updated deduplication", () => {
  test("receiving a participants list with duplicate userIds results in deduplicated state", () => {
    const { socket, serverEmit } = makeFakeSocket();
    const stateHolder: { participants: ParticipantInfo[] } = { participants: [] };
 
    // Wire the event handler (mirrors handleParticipantsUpdated)
    socket.on("collab:participants-updated", (data: { participants: ParticipantInfo[] }) => {
      const map = new Map<string, ParticipantInfo>();
      data.participants.forEach(p => map.set(p.userId, p));
      stateHolder.participants = Array.from(map.values());
    });
 
    serverEmit("collab:participants-updated", {
      participants: [
        makeParticipant({ userId: "user-1", userName: "Alice" }),
        makeParticipant({ userId: "user-1", userName: "Alice-duplicate" }),
        makeParticipant({ userId: "user-2", userName: "Bob" }),
      ],
    });
 
    expect(stateHolder.participants).toHaveLength(2);
    expect(stateHolder.participants.find(p => p.userId === "user-1")?.userName).toBe("Alice-duplicate");
  });
});

describe("socket event integration — updateActivity emits correct payload", () => {
  test("updateActivity emits 'collab:update-activity' with sessionId, activeFile, and cursor", () => {
    const { socket, clientEmissions } = makeFakeSocket();
 
    // Mirror the updateActivity function from the hook
    const sessionId = "session-test-001";
    const updateActivity = (activeFile?: string, cursor?: any) => {
      socket.emit("collab:update-activity", { sessionId, activeFile, cursor });
    };
 
    updateActivity("src/App.tsx");
 
    const emissions = clientEmissions();
    expect(emissions).toHaveLength(1);
    expect(emissions[0][0]).toBe("collab:update-activity");
    const payload = emissions[0][1] as any;
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.activeFile).toBe("src/App.tsx");
  });
 
  test("updateActivity with cursor emits cursor data", () => {
    const { socket, clientEmissions } = makeFakeSocket();
    const sessionId = "session-test-001";
    const updateActivity = (activeFile?: string, cursor?: any) => {
      socket.emit("collab:update-activity", { sessionId, activeFile, cursor });
    };
 
    const cursor = { fileId: "file-1", position: { lineNumber: 5, column: 3 } };
    updateActivity("App.tsx", cursor);
 
    const payload = clientEmissions()[0][1] as any;
    expect(payload.cursor).toEqual(cursor);
  });
});

describe("socket event integration — listener cleanup on 'unmount'", () => {
  test("removing listeners means subsequent server events do not update state", () => {
    const { socket, serverEmit } = makeFakeSocket();
    let callCount = 0;
 
    const handler = (_data: any) => { callCount++; };
    socket.on("collab:participants-updated", handler);
 
    // Simulate mount: first event received
    serverEmit("collab:participants-updated", { participants: [] });
    expect(callCount).toBe(1);
 
    // Simulate unmount: remove listener
    socket.off("collab:participants-updated", handler);
 
    // After unmount, event should not fire handler
    serverEmit("collab:participants-updated", { participants: [] });
    expect(callCount).toBe(1); // unchanged
  });
 
  test("all four event listeners are removed on cleanup", () => {
    const { socket, serverEmit } = makeFakeSocket();
    const counts = {
      participantsUpdated: 0,
      participantActivity: 0,
      activityLogs:        0,
      activityNew:         0,
    };
 
    const h1 = () => counts.participantsUpdated++;
    const h2 = () => counts.participantActivity++;
    const h3 = () => counts.activityLogs++;
    const h4 = () => counts.activityNew++;
 
    socket.on("collab:participants-updated",  h1);
    socket.on("collab:participant-activity",  h2);
    socket.on("collab:activity-logs",         h3);
    socket.on("collab:activity-new",          h4);
 
    // Fire each once to confirm registration
    serverEmit("collab:participants-updated",  { participants: [] });
    serverEmit("collab:participant-activity",  { userId: "u", lastActivity: 0 });
    serverEmit("collab:activity-logs",         { logs: [] });
    serverEmit("collab:activity-new",          makeActivity());
 
    expect(counts.participantsUpdated).toBe(1);
    expect(counts.participantActivity).toBe(1);
    expect(counts.activityLogs).toBe(1);
    expect(counts.activityNew).toBe(1);
 
    // Cleanup (mirrors hook's return () => {...})
    socket.off("collab:participants-updated",  h1);
    socket.off("collab:participant-activity",  h2);
    socket.off("collab:activity-logs",         h3);
    socket.off("collab:activity-new",          h4);
 
    // No more updates after cleanup
    serverEmit("collab:participants-updated",  { participants: [] });
    serverEmit("collab:participant-activity",  { userId: "u", lastActivity: 0 });
    serverEmit("collab:activity-logs",         { logs: [] });
    serverEmit("collab:activity-new",          makeActivity());
 
    expect(counts.participantsUpdated).toBe(1);
    expect(counts.participantActivity).toBe(1);
    expect(counts.activityLogs).toBe(1);
    expect(counts.activityNew).toBe(1);
  });
});

