// server/socket-awareness-redis.ts
import { Server as SocketIOServer, Socket } from "socket.io";
import { awarenessStore } from "../reddis/redis-awareness";
import {
  UserPresence,
  UserCursor,
  ActivityEvent,
  FileLock,
  CursorMovePayload,
  PresenceUpdatePayload,
  FileLockPayload,
  ActivityPayload,
  getUserColor,
} from "./types";

export function setupAwarenessHandlers(io: SocketIOServer, socket: Socket) {
  const sessionId = (socket as any).sessionId;
  const userId = (socket as any).userId;
  const userName = (socket as any).userName;

  if (!sessionId || !userId) {
    console.warn("⚠️ Socket missing sessionId or userId - cannot setup awareness handlers");
    return;
  }

  console.log(`🔧 Setting up awareness handlers for user ${userName} (${userId}) in session ${sessionId}`);

  // Remove existing listeners to prevent duplicates
  socket.removeAllListeners("cursor:move");
  socket.removeAllListeners("cursor:hide");
  socket.removeAllListeners("presence:update");
  socket.removeAllListeners("presence:request-all");
  socket.removeAllListeners("file:lock");
  socket.removeAllListeners("locks:request-all");
  socket.removeAllListeners("activity:log");
  socket.removeAllListeners("activity:request-all");
  socket.removeAllListeners("typing:start");

  // ============================================
  // CURSOR TRACKING
  // ============================================
  socket.on("cursor:move", async (payload: CursorMovePayload) => {
    try {
      const cursor: UserCursor = {
        userId: payload.userId,
        userName: payload.userName,
        userColor: getUserColor(payload.userId),
        fileId: payload.fileId,
        position: payload.position,
        selection: payload.selection,
        timestamp: Date.now(),
      };

      // Store in Redis
      await awarenessStore.setCursor(payload.sessionId, payload.userId, cursor);

      // Broadcast to others in session (exclude sender)
      socket.to(payload.sessionId).emit("cursor:update", cursor);

      // Update user activity
      await awarenessStore.updatePresenceActivity(payload.sessionId, payload.userId);
    } catch (error) {
      console.error("Error handling cursor:move", error);
    }
  });

  socket.on("cursor:hide", async (data: { sessionId: string; userId: string; fileId: string }) => {
    try {
      await awarenessStore.removeCursor(data.sessionId, data.userId);
      
      socket.to(data.sessionId).emit("cursor:remove", {
        userId: data.userId,
        fileId: data.fileId,
      });
    } catch (error) {
      console.error("Error handling cursor:hide", error);
    }
  });

  // ============================================
  // PRESENCE TRACKING
  // ============================================
  socket.on("presence:update", async (payload: PresenceUpdatePayload) => {
    try {
      const presence: UserPresence = {
        userId: payload.userId,
        userName: payload.userName,
        role: (socket as any).hostId === payload.userId ? "host" : "guest",
        status: payload.status,
        currentFile: payload.currentFile,
        isTyping: payload.isTyping,
        lastActivity: Date.now(),
        color: getUserColor(payload.userId),
      };

      // Store in Redis
      await awarenessStore.setPresence(payload.sessionId, payload.userId, presence);

      // Broadcast updated presence to all users
      io.to(payload.sessionId).emit("presence:update", presence);
    } catch (error) {
      console.error("Error handling presence:update", error);
    }
  });

  socket.on("presence:request-all", async (data: { sessionId: string }) => {
    try {
      const presences = await awarenessStore.getAllPresences(data.sessionId);
      
      socket.emit("presence:all", {
        sessionId: data.sessionId,
        presence: presences,
      });
    } catch (error) {
      console.error("Error handling presence:request-all", error);
    }
  });

  // ============================================
  // FILE LOCKING
  // ============================================
  
  // Request all current locks
  socket.on("locks:request-all", async (data: { sessionId: string }) => {
    try {
      const locks = await awarenessStore.getAllLocks(data.sessionId);
      
      socket.emit("locks:all", {
        sessionId: data.sessionId,
        locks,
      });
    } catch (error) {
      console.error("Error handling locks:request-all", error);
    }
  });

  socket.on("file:lock", async (payload: FileLockPayload) => {
    try {
      if (payload.action === "acquire") {
        const lock: FileLock = {
          fileId: payload.fileId,
          userId: payload.userId,
          userName: payload.userName,
          lockedAt: Date.now(),
          lockType: payload.lockType,
          autoReleaseAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        };

        // Try to acquire lock
        const result = await awarenessStore.acquireLock(
          payload.sessionId,
          payload.fileId,
          lock
        );

        if (!result.success) {
          // Lock denied
          socket.emit("file:lock-denied", {
            fileId: payload.fileId,
            lockedBy: result.existingLock?.userName,
            lockType: result.existingLock?.lockType,
          });
          return;
        }

        // Broadcast lock to all users
        io.to(payload.sessionId).emit("file:locked", lock);

        // Set auto-release timeout (this will run on the server that handled the lock)
        setTimeout(async () => {
          try {
            const currentLock = await awarenessStore.getLock(payload.sessionId, payload.fileId);
            if (currentLock && currentLock.userId === payload.userId) {
              await awarenessStore.releaseLock(payload.sessionId, payload.fileId);
              io.to(payload.sessionId).emit("file:unlocked", {
                fileId: payload.fileId,
                userId: payload.userId,
              });
            }
          } catch (error) {
            console.error("Error in lock auto-release", error);
          }
        }, 5 * 60 * 1000);
      } else if (payload.action === "release") {
        // Release lock
        await awarenessStore.releaseLock(payload.sessionId, payload.fileId);
        io.to(payload.sessionId).emit("file:unlocked", {
          fileId: payload.fileId,
          userId: payload.userId,
        });
      }
    } catch (error) {
      console.error("Error handling file:lock", error);
    }
  });

  // ============================================
  // ACTIVITY FEED
  // ============================================
  socket.on("activity:log", async (payload: ActivityPayload) => {
    try {
      const activity: ActivityEvent = {
        id: `${payload.userId}-${Date.now()}`,
        userId: payload.userId,
        userName: payload.userName,
        type: payload.type,
        description: payload.description,
        metadata: payload.metadata,
        timestamp: Date.now(),
      };

      // Store in Redis
      await awarenessStore.addActivity(payload.sessionId, activity);

      // Broadcast to all users
      io.to(payload.sessionId).emit("activity:new", activity);
    } catch (error) {
      console.error("Error handling activity:log", error);
    }
  });

  socket.on("activity:request-all", async (data: { sessionId: string }) => {
    try {
      const activities = await awarenessStore.getActivities(data.sessionId, 20);
      
      socket.emit("activity:all", {
        sessionId: data.sessionId,
        activities,
      });
    } catch (error) {
      console.error("Error handling activity:request-all", error);
    }
  });

  // ============================================
  // COLLISION DETECTION
  // ============================================
  socket.on("typing:start", async (data: {
    sessionId: string;
    userId: string;
    userName: string;
    fileId: string;
    lineNumber: number;
  }) => {
    try {
      // Check for collisions
      const collisions = await awarenessStore.detectCollisions(
        data.sessionId,
        data.fileId,
        data.lineNumber,
        data.userId
      );

      if (collisions.length > 0) {
        // Notify user of collision
        socket.emit("collision:detected", {
          fileId: data.fileId,
          users: collisions,
          yourLine: data.lineNumber,
        });

        // Notify others
        for (const collision of collisions) {
          io.to(data.sessionId).emit("collision:detected", {
            fileId: data.fileId,
            users: [{ userId: data.userId, userName: data.userName, lineNumber: data.lineNumber }],
            yourLine: collision.lineNumber,
          });
        }
      }
    } catch (error) {
      console.error("Error handling typing:start", error);
    }
  });

  // ============================================
  // CLEANUP ON DISCONNECT
  // ============================================
  socket.on("disconnect", async () => {
    console.log("🔌 Client disconnected:", socket.id);

    if (sessionId && userId) {
      try {
        // Notify others in the room
        socket.to(sessionId).emit("collab:user-left", {
          userId,
          userName,
          timestamp: Date.now(),
        });

        // Update presence to offline
        const presence = await awarenessStore.getPresence(sessionId, userId);
        if (presence) {
          presence.status = "offline";
          await awarenessStore.setPresence(sessionId, userId, presence);
          io.to(sessionId).emit("presence:update", presence);
        }

        // Remove cursor
        await awarenessStore.removeCursor(sessionId, userId);
        socket.to(sessionId).emit("cursor:remove", { userId, fileId: "*" });

        // Release all locks
        await awarenessStore.releaseAllUserLocks(sessionId, userId);
        const locks = await awarenessStore.getAllLocks(sessionId);
        locks.forEach(lock => {
          if (lock.userId === userId) {
            io.to(sessionId).emit("file:unlocked", { fileId: lock.fileId, userId });
          }
        });

        // Log activity
        const activity: ActivityEvent = {
          id: `${userId}-${Date.now()}`,
          userId,
          userName: userName || "Anonymous",
          type: "user_left",
          description: "left the session",
          timestamp: Date.now(),
        };
        await awarenessStore.addActivity(sessionId, activity);
        io.to(sessionId).emit("activity:new", activity);

        // Full cleanup after 5 minutes if user doesn't reconnect
        setTimeout(async () => {
          try {
            const currentPresence = await awarenessStore.getPresence(sessionId, userId);
            if (currentPresence && currentPresence.status === "offline") {
              await awarenessStore.cleanupUser(sessionId, userId);
              console.log(`🗑️ Cleaned up user ${userId} from session ${sessionId}`);
            }
          } catch (error) {
            console.error("Error in user cleanup timeout", error);
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error("Error handling disconnect cleanup", error);
      }
    }
  });
}

// ============================================
// BACKGROUND TASK: Idle Detection
// ============================================
export function startIdleDetection(io: SocketIOServer) {
  const IDLE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
  
  const interval = setInterval(async () => {
    try {
      // This is a simplified version - in production, you'd want to track active sessions
      // For now, we'll skip automatic idle detection and rely on client-side ping
      // Clients should send periodic presence:update to stay active
    } catch (error) {
      console.error("Error in idle detection", error);
    }
  }, IDLE_CHECK_INTERVAL);

  // Cleanup on server shutdown
  process.on("SIGTERM", () => {
    clearInterval(interval);
  });

  return interval;
}