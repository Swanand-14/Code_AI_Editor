// lib/redis-awareness.ts
import { Redis } from "@upstash/redis";
import {
  UserPresence,
  UserCursor,
  ActivityEvent,
  FileLock,
} from "@/modules/collaboration/types";

// Initialize Redis client (Upstash for serverless compatibility)
const redis = Redis.fromEnv(); // Uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

// Key generators for namespacing
const keys = {
  cursor: (sessionId: string, userId: string) => `collab:${sessionId}:cursor:${userId}`,
  cursors: (sessionId: string) => `collab:${sessionId}:cursors`,
  presence: (sessionId: string, userId: string) => `collab:${sessionId}:presence:${userId}`,
  presences: (sessionId: string) => `collab:${sessionId}:presences`,
  lock: (sessionId: string, fileId: string) => `collab:${sessionId}:lock:${fileId}`,
  locks: (sessionId: string) => `collab:${sessionId}:locks`,
  activities: (sessionId: string) => `collab:${sessionId}:activities`,
};

// TTL values (in seconds)
const TTL = {
  CURSOR: 30, // Cursors expire after 30s of no updates
  PRESENCE: 300, // Presence expires after 5 minutes
  LOCK: 300, // Locks expire after 5 minutes
  ACTIVITIES: 86400, // Activities kept for 24 hours
};

export class RedisAwarenessStore {
  // Helper method to safely parse JSON or return object as-is
  private static safeJsonParse<T>(data: string | object | null | undefined): T | null {
    if (!data) return null;
    
    try {
      // If already an object, return it
      if (typeof data === 'object') {
        return data as T;
      }
      
      // If it's a string, parse it
      if (typeof data === 'string') {
        return JSON.parse(data) as T;
      }
    } catch (error) {
      console.error('Failed to safely parse data:', { data, error });
    }
    
    return null;
  }

  // ============================================
  // CURSOR OPERATIONS (Using Hash)
  // ============================================
  
  async setCursor(
    sessionId: string,
    userId: string,
    cursor: UserCursor
  ): Promise<void> {
    const hashKey = keys.cursors(sessionId);
    await redis.hset(hashKey, { [userId]: JSON.stringify(cursor) });
    await redis.expire(hashKey, TTL.CURSOR);
  }

  async getCursor(sessionId: string, userId: string): Promise<UserCursor | null> {
    const hashKey = keys.cursors(sessionId);
    const data = await redis.hget<string | object>(hashKey, userId);
    return RedisAwarenessStore.safeJsonParse<UserCursor>(data);
  }

  async getAllCursors(sessionId: string): Promise<UserCursor[]> {
    const hashKey = keys.cursors(sessionId);
    const data = await redis.hgetall<Record<string, string | object>>(hashKey);
    
    if (!data) return [];
    
    return Object.values(data)
      .map(c => RedisAwarenessStore.safeJsonParse<UserCursor>(c))
      .filter((c): c is UserCursor => c !== null);
  }

  async removeCursor(sessionId: string, userId: string): Promise<void> {
    const hashKey = keys.cursors(sessionId);
    await redis.hdel(hashKey, userId);
  }

  async removeAllCursors(sessionId: string): Promise<void> {
    const hashKey = keys.cursors(sessionId);
    await redis.del(hashKey);
  }

  // ============================================
  // PRESENCE OPERATIONS (Using Hash)
  // ============================================
  
  async setPresence(
    sessionId: string,
    userId: string,
    presence: UserPresence
  ): Promise<void> {
    const hashKey = keys.presences(sessionId);
    await redis.hset(hashKey, { [userId]: JSON.stringify(presence) });
    await redis.expire(hashKey, TTL.PRESENCE);
  }

  async getPresence(sessionId: string, userId: string): Promise<UserPresence | null> {
    const hashKey = keys.presences(sessionId);
    const data = await redis.hget<string | object>(hashKey, userId);
    return RedisAwarenessStore.safeJsonParse<UserPresence>(data);
  }

  async getAllPresences(sessionId: string): Promise<UserPresence[]> {
    const hashKey = keys.presences(sessionId);
    const data = await redis.hgetall<Record<string, string | object>>(hashKey);
    
    if (!data) return [];
    
    return Object.values(data)
      .map(p => RedisAwarenessStore.safeJsonParse<UserPresence>(p))
      .filter((p): p is UserPresence => p !== null);
  }

  async removePresence(sessionId: string, userId: string): Promise<void> {
    const hashKey = keys.presences(sessionId);
    await redis.hdel(hashKey, userId);
  }

  async updatePresenceActivity(sessionId: string, userId: string): Promise<void> {
    const presence = await this.getPresence(sessionId, userId);
    if (presence) {
      presence.lastActivity = Date.now();
      presence.status = "active";
      await this.setPresence(sessionId, userId, presence);
    }
  }

  // ============================================
  // FILE LOCK OPERATIONS (Using Hash)
  // ============================================
  
  async acquireLock(
    sessionId: string,
    fileId: string,
    lock: FileLock
  ): Promise<{ success: boolean; existingLock?: FileLock }> {
    const hashKey = keys.locks(sessionId);
    
    // Check if already locked
    const existing = await redis.hget<string | object>(hashKey, fileId);
    if (existing) {
      const existingLock = RedisAwarenessStore.safeJsonParse<FileLock>(existing);
      if (existingLock) {
        // If locked by different user, deny
        if (existingLock.userId !== lock.userId) {
          return { success: false, existingLock };
        }
      }
    }

    // Acquire lock
    await redis.hset(hashKey, { [fileId]: JSON.stringify(lock) });
    await redis.expire(hashKey, TTL.LOCK);
    return { success: true };
  }

  async releaseLock(sessionId: string, fileId: string): Promise<void> {
    const hashKey = keys.locks(sessionId);
    await redis.hdel(hashKey, fileId);
  }

  async getLock(sessionId: string, fileId: string): Promise<FileLock | null> {
    const hashKey = keys.locks(sessionId);
    const data = await redis.hget<string | object>(hashKey, fileId);
    return RedisAwarenessStore.safeJsonParse<FileLock>(data);
  }

  async getAllLocks(sessionId: string): Promise<FileLock[]> {
    const hashKey = keys.locks(sessionId);
    const data = await redis.hgetall<Record<string, string | object>>(hashKey);
    
    if (!data) return [];
    
    return Object.values(data)
      .map(l => RedisAwarenessStore.safeJsonParse<FileLock>(l))
      .filter((l): l is FileLock => l !== null);
  }

  async releaseAllUserLocks(sessionId: string, userId: string): Promise<void> {
    const locks = await this.getAllLocks(sessionId);
    const hashKey = keys.locks(sessionId);
    
    const userLocks = locks.filter(l => l.userId === userId);
    
    for (const lock of userLocks) {
      await redis.hdel(hashKey, lock.fileId);
    }
  }

  // ============================================
  // ACTIVITY OPERATIONS (Using List + Limit)
  // ============================================
  
  async addActivity(sessionId: string, activity: ActivityEvent): Promise<void> {
    const listKey = keys.activities(sessionId);
    
    // Add to front of list
    await redis.lpush(listKey, JSON.stringify(activity));
    
    // Trim to keep only last 50 activities
    await redis.ltrim(listKey, 0, 49);
    
    // Set expiration
    await redis.expire(listKey, TTL.ACTIVITIES);
  }

  async getActivities(sessionId: string, limit: number = 20): Promise<ActivityEvent[]> {
    const listKey = keys.activities(sessionId);
    
    try {
      // lrange returns string[] directly with Upstash
      const data = await redis.lrange(listKey, 0, limit - 1);
      
      // Handle null or empty response
      if (!data) return [];
      
      // Ensure it's an array
      const activities = Array.isArray(data) ? data : [data];
      
      // Parse each item safely
      return activities
        .map((item) => RedisAwarenessStore.safeJsonParse<ActivityEvent>(item))
        .filter((item): item is ActivityEvent => item !== null);
    } catch (error) {
      console.error('Error getting activities:', error);
      return [];
    }
  }

  async clearActivities(sessionId: string): Promise<void> {
    const listKey = keys.activities(sessionId);
    await redis.del(listKey);
  }

  // ============================================
  // SESSION CLEANUP
  // ============================================
  
  async cleanupSession(sessionId: string): Promise<void> {
    // Delete all session-related keys
    await Promise.all([
      redis.del(keys.cursors(sessionId)),
      redis.del(keys.presences(sessionId)),
      redis.del(keys.locks(sessionId)),
      redis.del(keys.activities(sessionId)),
    ]);
  }

  async cleanupUser(sessionId: string, userId: string): Promise<void> {
    // Remove user's cursor, presence, and locks
    await Promise.all([
      this.removeCursor(sessionId, userId),
      this.removePresence(sessionId, userId),
      this.releaseAllUserLocks(sessionId, userId),
    ]);
  }

  // ============================================
  // IDLE DETECTION (Background Task)
  // ============================================
  
  async checkIdleUsers(sessionId: string): Promise<UserPresence[]> {
    const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes
    const now = Date.now();
    
    const presences = await this.getAllPresences(sessionId);
    const idleUsers: UserPresence[] = [];
    
    for (const presence of presences) {
      if (
        presence.status === "active" &&
        now - presence.lastActivity > IDLE_THRESHOLD
      ) {
        // Mark as idle
        presence.status = "idle";
        await this.setPresence(sessionId, presence.userId, presence);
        idleUsers.push(presence);
      }
    }
    
    return idleUsers;
  }

  // ============================================
  // COLLISION DETECTION
  // ============================================
  
  async detectCollisions(
    sessionId: string,
    fileId: string,
    lineNumber: number,
    currentUserId: string
  ): Promise<Array<{ userId: string; userName: string; lineNumber: number }>> {
    const cursors = await this.getAllCursors(sessionId);
    const presences = await this.getAllPresences(sessionId);
    
    const collisions: Array<{ userId: string; userName: string; lineNumber: number }> = [];
    
    for (const cursor of cursors) {
      if (
        cursor.userId !== currentUserId &&
        cursor.fileId === fileId &&
        Math.abs(cursor.position.lineNumber - lineNumber) <= 3
      ) {
        const presence = presences.find(p => p.userId === cursor.userId);
        if (presence?.isTyping) {
          collisions.push({
            userId: cursor.userId,
            userName: cursor.userName,
            lineNumber: cursor.position.lineNumber,
          });
        }
      }
    }
    
    return collisions;
  }
}

// Export singleton instance
export const awarenessStore = new RedisAwarenessStore();