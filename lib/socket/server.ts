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

// 🔥 NEW: WebContainer state management
interface WebContainerState {
  hostSocketId: string | null;
  hostUserId: string | null;
  serverUrl: string | null;
  isRunning: boolean;
  terminalHistory: string[];
  lastUpdate: number;
}

const sessionStates = new Map<string, WebContainerState>();

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

        // ============================================
        // COLLAB: Join Session
        // ============================================
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

        // ============================================
        // COLLAB: Editor & File Operations
        // ============================================
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

        // ============================================
        // 🔥 NEW: WEBCONTAINER - Server Ready
        // ============================================
        socket.on("webcontainer:server-ready", (data: {
          sessionId: string;
          serverUrl: string;
          isRunning: boolean;
        }) => {
          console.log(`📡 [SERVER] Host ${socket.id} server ready: ${data.serverUrl}`);
          
          // Store/update state
          let state = sessionStates.get(data.sessionId);
          if (!state) {
            state = {
              hostSocketId: socket.id,
              hostUserId: socket.userId || null,
              serverUrl: null,
              isRunning: false,
              terminalHistory: [],
              lastUpdate: Date.now(),
            };
            sessionStates.set(data.sessionId, state);
          }
          
          state.hostSocketId = socket.id;
          state.hostUserId = socket.userId || null;
          state.serverUrl = data.serverUrl;
          state.isRunning = data.isRunning;
          state.lastUpdate = Date.now();
          
          // Broadcast to all guests in session
          socket.to(data.sessionId).emit("webcontainer:server-ready", {
            sessionId: data.sessionId,
            serverUrl: data.serverUrl,
            isRunning: data.isRunning,
          });
          
          console.log(`✅ Broadcasted server URL to session ${data.sessionId}`);
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - State Updates
        // ============================================
        socket.on("webcontainer:state", (data: {
          sessionId: string;
          isLoading: boolean;
          isServerRunning: boolean;
          error: string | null;
        }) => {
          console.log(`📡 [SERVER] Host ${socket.id} state update for ${data.sessionId}`);
          
          const state = sessionStates.get(data.sessionId);
          if (state) {
            state.isRunning = data.isServerRunning;
            state.lastUpdate = Date.now();
          }
          
          // Broadcast to guests
          socket.to(data.sessionId).emit("webcontainer:state", data);
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - Terminal Output
        // ============================================
        socket.on("webcontainer:terminal", (data: {
          sessionId: string;
          data: string;
          timestamp: number;
        }) => {
          // Store in history (limit to last 1000 entries)
          const state = sessionStates.get(data.sessionId);
          if (state) {
            state.terminalHistory.push(data.data);
            if (state.terminalHistory.length > 1000) {
              state.terminalHistory = state.terminalHistory.slice(-1000);
            }
            state.lastUpdate = Date.now();
          }
          
          // Broadcast to guests (real-time)
          socket.to(data.sessionId).emit("webcontainer:terminal", data);
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - Request Initial Sync
        // ============================================
        socket.on("webcontainer:request-sync", (data: {
          sessionId: string;
        }) => {
          console.log(`📡 [SERVER] Guest ${socket.id} requesting sync for ${data.sessionId}`);
          
          const state = sessionStates.get(data.sessionId);
          
          if (state && state.hostSocketId && state.serverUrl) {
            // Send current state to requesting guest
            socket.emit("webcontainer:initial-sync", {
              sessionId: data.sessionId,
              serverUrl: state.serverUrl,
              isServerRunning: state.isRunning,
              terminalHistory: state.terminalHistory,
            });
            
            console.log(`✅ [SERVER] Sent initial sync to ${socket.id}`);
          } else {
            // No host yet or host hasn't booted container
            socket.emit("webcontainer:initial-sync", {
              sessionId: data.sessionId,
              serverUrl: null,
              isServerRunning: false,
              terminalHistory: ["⏳ Waiting for host to start WebContainer...\r\n"],
            });
            
            console.log(`⚠️ [SERVER] No host state available for ${data.sessionId}`);
          }
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - File Sync Request (Guest → Host)
        // ============================================
        socket.on("webcontainer:file-sync", (data: {
          sessionId: string;
          path: string;
          content: string;
          userId: string;
        }) => {
          console.log(`📡 [SERVER] Guest ${socket.id} file sync: ${data.path}`);
          
          const state = sessionStates.get(data.sessionId);
          
          if (state && state.hostSocketId) {
            // Forward to host
            io!.to(state.hostSocketId).emit("webcontainer:file-sync", data);
            console.log(`✅ Forwarded file sync to host ${state.hostSocketId}`);
          } else {
            // No host available
            socket.emit("webcontainer:sync-error", {
              sessionId: data.sessionId,
              path: data.path,
              error: "Host is not available",
            });
            console.warn(`⚠️ No host available for session ${data.sessionId}`);
          }
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - Sync Error
        // ============================================
        socket.on("webcontainer:sync-error", (data: {
          sessionId: string;
          path: string;
          error: string;
        }) => {
          // Broadcast error to all guests
          socket.to(data.sessionId).emit("webcontainer:sync-error", data);
        });

        // ============================================
        // 🔥 NEW: WEBCONTAINER - Command (for future extensibility)
        // ============================================
        socket.on("webcontainer:command", (data: {
          sessionId: string;
          userId: string;
          userName: string;
          command: "start" | "stop" | "restart";
          timestamp: number;
        }) => {
          console.log(`📡 [SERVER] Command ${data.command} from ${data.userName}`);
          
          // Broadcast to host for execution
          const state = sessionStates.get(data.sessionId);
          if (state && state.hostSocketId) {
            io!.to(state.hostSocketId).emit("webcontainer:command", data);
          }
        });

        // ============================================
        // DISCONNECT - Cleanup
        // ============================================
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

            // 🔥 NEW: Check if disconnecting socket was the host
            const state = sessionStates.get(socket.sessionId);
            if (state && state.hostSocketId === socket.id) {
              console.log(`⚠️ Host disconnected from session ${socket.sessionId}`);
              
              // Notify guests
              io!.to(socket.sessionId).emit("webcontainer:host-disconnected", {
                sessionId: socket.sessionId,
                message: "Host has disconnected. WebContainer is paused.",
              });
              
              // Mark as inactive but keep state for potential reconnection
              state.isRunning = false;
              state.lastUpdate = Date.now();
              
              // Clear state after 5 minutes of inactivity
              setTimeout(() => {
                const currentState = sessionStates.get(socket.sessionId!);
                if (currentState && currentState.hostSocketId === socket.id) {
                  sessionStates.delete(socket.sessionId!);
                  console.log(`🗑️ Cleared state for session ${socket.sessionId}`);
                  
                  // Notify remaining users
                  io!.to(socket.sessionId!).emit("webcontainer:session-expired", {
                    sessionId: socket.sessionId,
                    message: "Host has been offline for too long. Session state cleared.",
                  });
                }
              }, 5 * 60 * 1000); // 5 minutes
            }
          }
        });
    });

    return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

// 🔥 NEW: Utility functions for monitoring/debugging
export function getSessionState(sessionId: string): WebContainerState | null {
  return sessionStates.get(sessionId) || null;
}

export function clearSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  console.log(`🗑️ Manually cleared state for session ${sessionId}`);
}

export function getAllSessionStates(): Map<string, WebContainerState> {
  return new Map(sessionStates);
}