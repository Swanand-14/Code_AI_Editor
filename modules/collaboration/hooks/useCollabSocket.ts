// hooks/useCollabSocket.ts - Complete Redis-aligned version
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Socket, io } from "socket.io-client";
import {
  UserPresence,
  UserCursor,
  ActivityEvent,
  FileLock,
  getUserColor,
} from "@/modules/collaboration/types";

// Re-export types for backward compatibility
export interface CollabUser {
  userId: string;
  userName: string;
  userImage?: string;
  role: string;
  activeFile?: string;
  cursor?: {
    fileId: string;
    position: { lineNumber: number; column: number };
  };
}

export interface EditorChangePayload {
  sessionId: string;
  userId?: string;
  userName?: string;
  fileId: string;
  filePath: string;
  content: string;
  changes: any;
  timestamp: number;
}

export interface FileActionPayload {
  sessionId: string;
  userId?: string;
  userName?: string;
  action: "create" | "delete" | "rename";
  filePath: string;
  newPath?: string;
  content?: string;
}

export function useCollabSocket(
  sessionId: string,
  userId?: string,
  userName?: string
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Legacy participants (for backward compatibility)
  const [participants, setParticipants] = useState<CollabUser[]>([]);
  
  // New Redis-backed awareness state
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, UserCursor>>(new Map());
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [fileLocks, setFileLocks] = useState<Map<string, FileLock>>(new Map());
  const [collisions, setCollisions] = useState<Map<string, any>>(new Map());

  // Debounce refs
  const cursorDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const presenceDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const editorChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    const socketInstance = io({
      path: "/api/socket",
      addTrailingSlash: false,
    });

    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      console.log("✅ Connected to collaboration server");
      setIsConnected(true);

      socketInstance.emit("collab:join", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
      });

      // Request initial Redis state
      socketInstance.emit("presence:request-all", { sessionId });
      socketInstance.emit("activity:request-all", { sessionId });
    });

    socketInstance.on("disconnect", () => {
      console.log("❌ Disconnected from collaboration server");
      setIsConnected(false);
    });

    // ============================================
    // LEGACY SESSION EVENTS (for backward compatibility)
    // ============================================
    socketInstance.on("collab:joined", (data: { participants: CollabUser[] }) => {
      console.log("✅ Joined collaboration session", data);
      setParticipants(data.participants);
    });

    socketInstance.on("collab:user-joined", (data: { userId: string; userName: string }) => {
      console.log("👤 User joined:", data.userName);
      setParticipants((prev) => [
        ...prev,
        { userId: data.userId, userName: data.userName, role: "editor" },
      ]);
    });

    socketInstance.on("collab:user-left", (data: { userId: string; userName: string }) => {
      console.log("👤 User left:", data.userName);
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
    });

    socketInstance.on("collab:error", (data: { message: string }) => {
      console.error("❌ Collaboration error:", data.message);
    });

    // ============================================
    // PRESENCE HANDLERS (Redis-backed)
    // ============================================
    socketInstance.on("presence:all", (data: { presence: UserPresence[] }) => {
      console.log("📊 Received all presences:", data.presence.length);
      setPresences(data.presence);
    });

    socketInstance.on("presence:update", (presence: UserPresence) => {
      setPresences((prev) => {
        const index = prev.findIndex((p) => p.userId === presence.userId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = presence;
          return updated;
        }
        return [...prev, presence];
      });
    });

    // ============================================
    // CURSOR HANDLERS (Redis-backed)
    // ============================================
    socketInstance.on("cursor:update", (cursor: UserCursor) => {
      setRemoteCursors((prev) => {
        const updated = new Map(prev);
        updated.set(cursor.userId, cursor);
        return updated;
      });
    });

    socketInstance.on("cursor:remove", (data: { userId: string }) => {
      setRemoteCursors((prev) => {
        const updated = new Map(prev);
        updated.delete(data.userId);
        return updated;
      });
    });

    // ============================================
    // ACTIVITY HANDLERS (Redis-backed)
    // ============================================
    socketInstance.on("activity:all", (data: { activities: ActivityEvent[] }) => {
      console.log("📋 Received activities:", data.activities.length);
      setActivities(data.activities);
    });

    socketInstance.on("activity:new", (activity: ActivityEvent) => {
      setActivities((prev) => [activity, ...prev].slice(0, 20));
    });

    // ============================================
    // FILE LOCK HANDLERS (Redis-backed)
    // ============================================
    socketInstance.on("file:locked", (lock: FileLock) => {
      console.log("🔒 File locked:", lock.fileId, "by", lock.userName);
      setFileLocks((prev) => {
        const updated = new Map(prev);
        updated.set(lock.fileId, lock);
        return updated;
      });
    });

    socketInstance.on("file:unlocked", (data: { fileId: string }) => {
      console.log("🔓 File unlocked:", data.fileId);
      setFileLocks((prev) => {
        const updated = new Map(prev);
        updated.delete(data.fileId);
        return updated;
      });
    });

    socketInstance.on("file:lock-denied", (data: {
      fileId: string;
      lockedBy: string;
      lockType: "soft" | "hard";
    }) => {
      console.warn(`⚠️ File locked by ${data.lockedBy} (${data.lockType})`);
    });

    // ============================================
    // COLLISION HANDLERS (Redis-backed)
    // ============================================
    socketInstance.on("collision:detected", (data: {
      fileId: string;
      users: Array<{ userId: string; userName: string; lineNumber: number }>;
      yourLine: number;
    }) => {
      console.log("⚠️ Edit collision detected:", data);
      setCollisions((prev) => {
        const updated = new Map(prev);
        updated.set(data.fileId, data);
        return updated;
      });

      // Auto-clear collision after 5 seconds
      setTimeout(() => {
        setCollisions((prev) => {
          const updated = new Map(prev);
          updated.delete(data.fileId);
          return updated;
        });
      }, 5000);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [sessionId, userId, userName]);

  // ============================================
  // EMIT FUNCTIONS
  // ============================================

  // Editor changes (with debouncing)
  const emitEditorChange = useCallback(
    (payload: Omit<EditorChangePayload, "userId" | "userName" | "sessionId">) => {
      if (!socket || !userId) return;

      // Debounce editor changes (200ms)
      if (editorChangeDebounceRef.current) {
        clearTimeout(editorChangeDebounceRef.current);
      }

      editorChangeDebounceRef.current = setTimeout(() => {
        socket.emit("editor:change", {
          ...payload,
          sessionId,
          userId,
          userName: userName || "Anonymous",
        });
      }, 200);
    },
    [socket, sessionId, userId, userName]
  );

  // Cursor movements (with debouncing)
  const emitCursorMove = useCallback(
    (fileId: string, position: { lineNumber: number; column: number }, selection?: any) => {
      if (!socket || !userId) return;

      // Debounce cursor updates (100ms)
      if (cursorDebounceRef.current) {
        clearTimeout(cursorDebounceRef.current);
      }

      cursorDebounceRef.current = setTimeout(() => {
        socket.emit("cursor:move", {
          sessionId,
          userId,
          userName: userName || "Anonymous",
          fileId,
          position,
          selection,
        });

        lastActivityRef.current = Date.now();
      }, 100);
    },
    [socket, sessionId, userId, userName]
  );

  const emitCursorHide = useCallback(
    (fileId: string) => {
      if (!socket || !userId) return;

      socket.emit("cursor:hide", {
        sessionId,
        userId,
        fileId,
      });
    },
    [socket, sessionId, userId]
  );

  // Presence updates (with debouncing)
  const emitPresenceUpdate = useCallback(
    (currentFile?: { fileId: string; filePath: string }, isTyping: boolean = false) => {
      if (!socket || !userId) return;

      // Update last activity
      lastActivityRef.current = Date.now();

      // Debounce presence updates (500ms)
      if (presenceDebounceRef.current) {
        clearTimeout(presenceDebounceRef.current);
      }

      presenceDebounceRef.current = setTimeout(() => {
        socket.emit("presence:update", {
          sessionId,
          userId,
          userName: userName || "Anonymous",
          currentFile,
          isTyping,
          status: "active",
        });
      }, 500);
    },
    [socket, sessionId, userId, userName]
  );

  // File operations
  const emitFileAction = useCallback(
    (payload: Omit<FileActionPayload, "userId" | "userName" | "sessionId">) => {
      if (!socket || !userId) return;

      socket.emit("file:action", {
        ...payload,
        sessionId,
        userId,
        userName: userName || "Anonymous",
      });
    },
    [socket, sessionId, userId, userName]
  );

  const emitFileOpen = useCallback(
    (fileId: string, filePath: string) => {
      if (!socket || !userId) return;

      socket.emit("file:open", { fileId, filePath });
      
      // Also update presence
      emitPresenceUpdate({ fileId, filePath }, false);
    },
    [socket, userId, emitPresenceUpdate]
  );

  // File locking
  const emitFileLock = useCallback(
    (fileId: string, action: "acquire" | "release", lockType: "soft" | "hard" = "soft") => {
      if (!socket || !userId) return;

      socket.emit("file:lock", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
        fileId,
        action,
        lockType,
      });
    },
    [socket, sessionId, userId, userName]
  );

  // Activity logging
  const emitActivity = useCallback(
    (type: ActivityEvent["type"], description: string, metadata?: any) => {
      if (!socket || !userId) return;

      socket.emit("activity:log", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
        type,
        description,
        metadata,
      });
    },
    [socket, sessionId, userId, userName]
  );

  // Typing detection for collision
  const emitTypingStart = useCallback(
    (fileId: string, lineNumber: number) => {
      if (!socket || !userId) return;

      socket.emit("typing:start", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
        fileId,
        lineNumber,
      });
    },
    [socket, sessionId, userId, userName]
  );

  // WebContainer commands (from your existing code)
  const emitWebContainerCommand = useCallback(
    (command: "start" | "stop" | "restart") => {
      if (!socket || !userId) return;

      socket.emit("webcontainer:command", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
        command,
        timestamp: Date.now(),
      });
    },
    [socket, sessionId, userId, userName]
  );

  return {
    // Socket state
    socket,
    isConnected,
    
    // Legacy support
    participants, // Keep for backward compatibility
    
    // New Redis-backed awareness state
    presences, // Use this instead of participants for awareness features
    remoteCursors,
    activities,
    fileLocks,
    collisions,
    userColor: userId ? getUserColor(userId) : "#3B82F6",
    
    // Emit functions
    emitEditorChange,
    emitCursorMove,
    emitCursorHide,
    emitPresenceUpdate,
    emitFileAction,
    emitFileOpen,
    emitFileLock,
    emitActivity,
    emitTypingStart,
    emitWebContainerCommand,
  };
}