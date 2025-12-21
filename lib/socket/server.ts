import {Server as HttpServer} from 'http';
import {Server as SocketIOServer,Socket} from 'socket.io';
import { prisma } from '../db';

export interface CollabSocket extends Socket{
    userId?:string;
    sessionId?:string,
    userName?:string
}

export interface EditorChangePayload {
  sessionId: string;
  userId: string;
  userName: string;
  fileId: string;
  filePath: string;
  content: string;
  changes: any; // Monaco IModelContentChange[]
  timestamp: number;
}

export interface CursorPositionPayload {
  sessionId: string;
  userId: string;
  userName: string;
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
  userId: string;
  userName: string;
  action: "create" | "delete" | "rename";
  filePath: string;
  newPath?: string;
  content?: string;
}
export interface UserPresencePayload {
  sessionId: string;
  userId: string;
  userName: string;
  userImage?: string;
  activeFile?: string;
  status: "online" | "away" | "offline";
}

let io:SocketIOServer|null = null;

export function initSocketServer(httpServer:HttpServer):SocketIOServer{
    if(io){
        return io;
    }

    io = new SocketIOServer(httpServer,{
        cors:{
            origin:process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            methods:["GET","POST"],
            credentials:true
        },
        path:"/api/socket",
        addTrailingSlash:false
    })
    io.on("connection",async(socket:CollabSocket)=>{
        console.log("Client connected:",socket.id);

        socket.on("collab:join",async(data:{sessionId:string;userId?:string;userName?:string})=>{
            const {sessionId,userId,userName} = data;
            try {
                const session = await prisma.collabSession.findUnique({
          where: { sessionId },
        });

        if (!session || !session.isActive || new Date() > session.expiresAt) {
          socket.emit("collab:error", { message: "Session not found or expired" });
          return;
        }

        // Store user info on socket
        socket.userId = userId || `guest-${socket.id}`;
        socket.sessionId = sessionId;
        socket.userName = userName || "Anonymous";

        // Join the session room
        socket.join(sessionId);

        // Update participant's last seen
        if (userId) {
          await prisma.collabParticipant.updateMany({
            where: { sessionId: session.id, userId },
            data: { lastSeenAt: new Date() },
          });
        }

        // Get all participants in the session
        const participants = await prisma.collabParticipant.findMany({
          where: { sessionId: session.id },
          include: { user: { select: { id: true, name: true, image: true } } },
        });

        // Notify user they joined successfully
        socket.emit("collab:joined", {
          sessionId,
          participants: participants.map((p) => ({
            userId: p.userId,
            userName: p.user?.name || p.displayName || "Anonymous",
            userImage: p.user?.image,
            role: p.role,
            joinedAt: p.joinedAt,
          })),
        });

        // Notify others in the room
        socket.to(sessionId).emit("collab:user-joined", {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: Date.now(),
        });

        console.log(`✅ User ${socket.userName} joined session ${sessionId}`);
            } catch (error) {
                console.error("Error joining collab session:", error);
        socket.emit("collab:error", { message: "Failed to join session" });
                
            }
        });

        socket.on("editor:change", (payload: EditorChangePayload) => {
      if (!socket.sessionId) return;

      // Broadcast to all other users in the session
      socket.to(socket.sessionId).emit("editor:change", {
        ...payload,
        userId: socket.userId,
        userName: socket.userName,
      });
    });
    socket.on("cursor:move", (payload: CursorPositionPayload) => {
      if (!socket.sessionId) return;

      socket.to(socket.sessionId).emit("cursor:move", {
        ...payload,
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on("file:action", (payload: FileActionPayload) => {
      if (!socket.sessionId) return;

      socket.to(socket.sessionId).emit("file:action", {
        ...payload,
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on("file:open", (payload: { fileId: string; filePath: string }) => {
      if (!socket.sessionId) return;

      socket.to(socket.sessionId).emit("user:file-changed", {
        userId: socket.userId,
        userName: socket.userName,
        fileId: payload.fileId,
        filePath: payload.filePath,
      });
    });
    socket.on("presence:update", (payload: Partial<UserPresencePayload>) => {
      if (!socket.sessionId) return;

      socket.to(socket.sessionId).emit("presence:update", {
        ...payload,
        userId: socket.userId,
        userName: socket.userName,
        sessionId: socket.sessionId,
      });
    });
    socket.on("disconnect", async () => {
      console.log("🔌 Client disconnected:", socket.id);

      if (socket.sessionId && socket.userId) {
        // Notify others in the room
        socket.to(socket.sessionId).emit("collab:user-left", {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: Date.now(),
        });

        // Update last seen in database
        if (socket.userId.startsWith("guest-") === false) {
          await prisma.collabParticipant.updateMany({
            where: { 
              sessionId: socket.sessionId,
              userId: socket.userId,
            },
            data: { lastSeenAt: new Date() },
          });
        }
      }
    });

    })
    return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}