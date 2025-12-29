"use client";

import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";

// Import types from server
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

// Define payload types here to avoid circular imports
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

export interface CursorPositionPayload {
  sessionId: string;
  userId?: string;
  userName?: string;
  fileId: string;
  position: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
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

export function useCollabSocket(sessionId: string, userId?: string, userName?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<CollabUser[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io({
      path: "/api/socket",
      addTrailingSlash: false,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    // Connection events
    socketInstance.on("connect", () => {
      console.log("✅ Connected to collaboration server");
      setIsConnected(true);

      // Join the collaboration session
      socketInstance.emit("collab:join", {
        sessionId,
        userId,
        userName: userName || "Anonymous",
      });
    });

    socketInstance.on("disconnect", () => {
      console.log("❌ Disconnected from collaboration server");
      setIsConnected(false);
    });

    // Session events
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

    // Cleanup
    return () => {
      socketInstance.disconnect();
    };
  }, [sessionId, userId, userName]);

  // Helper functions to emit events
  const emitEditorChange = (payload: Omit<EditorChangePayload, "userId" | "userName" | "sessionId">) => {
    socket?.emit("editor:change", { ...payload, sessionId, userId, userName });
  };

  const emitCursorMove = (payload: Omit<CursorPositionPayload, "userId" | "userName" | "sessionId">) => {
    socket?.emit("cursor:move", { ...payload, sessionId, userId, userName });
  };

  const emitFileAction = (payload: Omit<FileActionPayload, "userId" | "userName" | "sessionId">) => {
    socket?.emit("file:action", { ...payload, sessionId, userId, userName });
  };
  const emitFileChange = (fileId: string, content: string, action: 'update' | 'delete') => {
    socket.emit('file:change', { fileId, content, action });
  };

  const emitFileOpen = (fileId: string, filePath: string) => {
    socket?.emit("file:open", { fileId, filePath });
  };

  const emitPresenceUpdate = (status: "online" | "away" | "offline", activeFile?: string) => {
    socket?.emit("presence:update", { status, activeFile });
  };

  return {
    socket,
    isConnected,
    participants,
    emitEditorChange,
    emitCursorMove,
    emitFileAction,
    emitFileOpen,
    emitPresenceUpdate,
    emitFileChange
  };
}