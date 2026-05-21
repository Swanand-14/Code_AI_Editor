"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebContainer } from "../hooks/useWebContainer";
import { useCollabSocket } from "@/modules/collaboration/hooks/useCollabSocket";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { toast } from "sonner";

interface UseCollabWebContainerProps {
  sessionId: string;
  templateData: TemplateFolder | null;
  isHost: boolean; // Critical: Only host boots WebContainer
  userId?: string;
  userName?: string;
  terminalRef?: React.RefObject<any>;
}

interface UseCollabWebContainerReturn {
  // WebContainer state (same as solo)
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: any | null;
  isServerRunning: boolean;
  isReady: boolean;
  
  // Terminal state (for all users)
  terminalHistory: string[];
  
  // Actions (host only, guests disabled)
  startServer: () => Promise<void>;
  restartServer: () => Promise<void>;
  stopServer: () => void;
  
  // File sync (handled automatically)
  syncFileToContainer: (path: string, content: string) => Promise<void>;
}

export const useCollabWebContainer = ({
  sessionId,
  templateData,
  isHost,
  userId,
  userName,
  terminalRef,
}: UseCollabWebContainerProps): UseCollabWebContainerReturn => {
  
  //  HOST: Use full WebContainer (your existing hook)
  const hostWebContainer = useWebContainer({
    templateData: isHost ? templateData : null,
    autoStart: isHost,
    projectId: sessionId,
    terminalRef,
    skipInit: !isHost,
  });

  // GUEST: Just track remote state
  const [guestServerUrl, setGuestServerUrl] = useState<string | null>(null);
  const [guestIsLoading, setGuestIsLoading] = useState(true);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  
  // Socket connection
  const { socket, isConnected, emitWebContainerCommand } = useCollabSocket(
    sessionId,
    userId,
    userName
  );

  // Track if we've received initial state from host
  const hasReceivedInitialState = useRef(false);

  // ============================================
  // HOST: Broadcast WebContainer events
  // ============================================
  useEffect(() => {
    if (!isHost || !socket || !isConnected) return;

    console.log("🎙️ [HOST] Broadcasting WebContainer state", {
      hasServerUrl: !!hostWebContainer.serverUrl,
      serverUrl: hostWebContainer.serverUrl,
      isRunning: hostWebContainer.isServerRunning,
      isLoading: hostWebContainer.isLoading
    });

    //  Broadcast when server becomes ready
    //  FIX: Only broadcast if BOTH conditions met AND not localhost
    const isValidUrl = hostWebContainer.serverUrl && 
                       !hostWebContainer.serverUrl.includes('localhost') &&
                       !hostWebContainer.serverUrl.includes('127.0.0.1');
    
    if (isValidUrl && hostWebContainer.isServerRunning && !hostWebContainer.isLoading) {
      console.log("📡 [HOST] Broadcasting server URL:", hostWebContainer.serverUrl);
      
      socket.emit("webcontainer:server-ready", {
        sessionId,
        serverUrl: hostWebContainer.serverUrl,
        isRunning: true,
      });
    } else {
      console.log("⏳ [HOST] Not broadcasting yet:", {
        hasUrl: !!hostWebContainer.serverUrl,
        isLocalhost: hostWebContainer.serverUrl?.includes('localhost'),
        isRunning: hostWebContainer.isServerRunning,
        isLoading: hostWebContainer.isLoading
      });
    }

    // 2️⃣ Broadcast loading state changes
    socket.emit("webcontainer:state", {
      sessionId,
      isLoading: hostWebContainer.isLoading,
      isServerRunning: hostWebContainer.isServerRunning,
      error: hostWebContainer.error,
    });

  }, [
    isHost,
    socket,
    isConnected,
    sessionId,
    hostWebContainer.serverUrl,
    hostWebContainer.isServerRunning,
    hostWebContainer.isLoading,
    hostWebContainer.error,
  ]);

  // ============================================
  // HOST: Intercept terminal output and broadcast
  // ============================================
  useEffect(() => {
    if (!isHost || !terminalRef?.current) return;

    // Monkey-patch writeToTerminal to also broadcast
    const originalWrite = terminalRef.current.writeToTerminal;
    
    terminalRef.current.writeToTerminal = (data: string) => {
      // Call original function (local display)
      originalWrite.call(terminalRef.current, data);
      
      // Broadcast to guests
      if (socket && isConnected) {
        socket.emit("webcontainer:terminal", {
          sessionId,
          data,
          timestamp: Date.now(),
        });
      }
      
      // Store in history
      setTerminalHistory(prev => [...prev, data]);
    };
    // Monkey-patch terminal write function:

// preserve original host output, and also broadcast the same output

// to all guests in real-time via socket. Cleanup restores original write.

    return () => {
      if (terminalRef.current) {
        terminalRef.current.writeToTerminal = originalWrite;
      }
    };
  }, [isHost, terminalRef, socket, isConnected, sessionId]);

  
  // GUEST: Listen for host events
  
  useEffect(() => {
    if (isHost || !socket) return;

    console.log("👀 [GUEST] Setting up WebContainer listeners");

    // Server ready event
    const handleServerReady = (data: {
      sessionId: string;
      serverUrl: string;
      isRunning: boolean;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      console.log("GUEST Received server URL:", data.serverUrl);
      setGuestServerUrl(data.serverUrl);
      setGuestIsLoading(false);
      
      toast.success("Preview server is ready!");
    };

    // State updates
    const handleStateUpdate = (data: {
      sessionId: string;
      isLoading: boolean;
      isServerRunning: boolean;
      error: string | null;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      setGuestIsLoading(data.isLoading);
      
      if (data.error) {
        toast.error(data.error);
      }
    };

    // 3️⃣ Terminal output
    const handleTerminalOutput = (data: {
      sessionId: string;
      data: string;
      timestamp: number;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      // Write to terminal
      if (terminalRef?.current?.writeToTerminal) {
        terminalRef.current.writeToTerminal(data.data);
      }
      
      // Store in history
      setTerminalHistory(prev => [...prev, data.data]);
    };

    // Initial state sync (when guest joins)
    const handleInitialSync = (data: {
      sessionId: string;
      serverUrl: string | null;
      isServerRunning: boolean;
      terminalHistory: string[];
    }) => {
      if (data.sessionId !== sessionId) return;
      
      console.log("[GUEST] Received initial state:", {
        hasUrl: !!data.serverUrl,
        serverUrl: data.serverUrl,  //  NEW: Log the actual URL
        isRunning: data.isServerRunning,
        historyLines: data.terminalHistory.length
      });
      
      hasReceivedInitialState.current = true;
      
      if (data.serverUrl) {
        setGuestServerUrl(data.serverUrl);
        setGuestIsLoading(false);
        console.log("GUEST Preview URL set:", data.serverUrl);
      } else {
        console.log("GUEST No server URL yet, waiting for host...");
        setGuestIsLoading(true);
      }
      
      setTerminalHistory(data.terminalHistory);
      
      // Replay terminal history
      if (terminalRef?.current?.writeToTerminal && data.terminalHistory.length > 0) {
        data.terminalHistory.forEach(line => {
          terminalRef.current.writeToTerminal(line);
        });
      }
    };

    socket.on("webcontainer:server-ready", handleServerReady);
    socket.on("webcontainer:state", handleStateUpdate);
    socket.on("webcontainer:terminal", handleTerminalOutput);
    socket.on("webcontainer:initial-sync", handleInitialSync);

    //  FIX: Request initial state immediately AND periodically until received
    const requestSync = () => {
      if (!hasReceivedInitialState.current) {
        console.log("📡 [GUEST] Requesting initial state from host");
        socket.emit("webcontainer:request-sync", { sessionId });
      }
    };

    // Request immediately
    requestSync();

    //  NEW: Keep requesting every 2 seconds until we get a response
    const syncInterval = setInterval(() => {
      if (!hasReceivedInitialState.current) {
        console.log(" Still waiting for initial state, retrying...");
        requestSync();
      } else {
        clearInterval(syncInterval);
      }
    }, 2000);

    return () => {
      clearInterval(syncInterval);
      socket.off("webcontainer:server-ready", handleServerReady);
      socket.off("webcontainer:state", handleStateUpdate);
      socket.off("webcontainer:terminal", handleTerminalOutput);
      socket.off("webcontainer:initial-sync", handleInitialSync);
    };
  }, [isHost, socket, sessionId, terminalRef]);

  // File Sync: All users can trigger, host executes
 
  const syncFileToContainer = useCallback(
    async (path: string, content: string) => {
      if (isHost) {
        // HOST: Write directly to WebContainer
        try {
          await hostWebContainer.writeFileSync(path, content);
          console.log(` [HOST] Synced ${path} to WebContainer`);
          
          
        } catch (error) {
          console.error(` Failed to sync ${path}:`, error);
        }
      } else {
        // GUEST: Send sync request to host via Socket
        if (socket && isConnected) {
          socket.emit("webcontainer:file-sync", {
            sessionId,
            path,
            content,
            userId,
          });
          console.log(`[GUEST] Requested file sync: ${path}`);
        }
      }
    },
    [isHost, hostWebContainer, socket, isConnected, sessionId, userId]
  );

  
  // HOST: Listen for guest file sync requests
 
  useEffect(() => {
    if (!isHost || !socket) return;

    const handleFileSyncRequest = async (data: {
      sessionId: string;
      path: string;
      content: string;
      userId: string;
    }) => {
      if (data.sessionId !== sessionId) return;
      
      console.log(` [HOST] File sync request from ${data.userId}: ${data.path}`);
      
      try {
        await hostWebContainer.writeFileSync(data.path, data.content);
        
        
        
        console.log(` [HOST] Synced ${data.path} from guest`);
      } catch (error) {
        console.error(`Failed to sync ${data.path}:`, error);
        
        // Notify guest of error
        socket.emit("webcontainer:sync-error", {
          sessionId,
          path: data.path,
          error: error instanceof Error ? error.message : "Sync failed",
        });
      }
    };

    socket.on("webcontainer:file-sync", handleFileSyncRequest);

    return () => {
      socket.off("webcontainer:file-sync", handleFileSyncRequest);
    };
  }, [isHost, socket, sessionId, hostWebContainer]);

 
  // Server Control (Host-only actions)
  
  const startServer = useCallback(async () => {
    if (!isHost) {
      console.warn("⚠️ Only host can start server");
      return;
    }
    await hostWebContainer.startServer();
  }, [isHost, hostWebContainer]);

  const restartServer = useCallback(async () => {
    if (!isHost) {
      console.warn(" Only host can restart server");
      return;
    }
    
    // Notify guests that server is restarting
    if (socket && isConnected) {
      socket.emit("webcontainer:state", {
        sessionId,
        isLoading: true,
        isServerRunning: false,
        error: null,
      });
    }
    
    await hostWebContainer.restartServer();
  }, [isHost, hostWebContainer, socket, isConnected, sessionId]);

  const stopServer = useCallback(() => {
    if (!isHost) {
      console.warn(" Only host can stop server");
      return;
    }
    hostWebContainer.stopServer();
  }, [isHost, hostWebContainer]);

  
  // Return appropriate state based on role
  
  return {
    serverUrl: isHost ? hostWebContainer.serverUrl : guestServerUrl,
    isLoading: isHost ? hostWebContainer.isLoading : guestIsLoading,
    error: isHost ? hostWebContainer.error : null,
    instance: isHost ? hostWebContainer.instance : null,
    isServerRunning: isHost 
      ? hostWebContainer.isServerRunning 
      : guestServerUrl !== null,
    isReady:isHost?hostWebContainer.isReady:true,
    terminalHistory,
    startServer,
    restartServer,
    stopServer,
    syncFileToContainer,
  };
};