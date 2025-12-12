import { useState, useEffect, useCallback, useRef } from "react";
import { webContainerService } from "../services/webContainer-services";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { transformToWebContainerFormat } from "./transformer";

interface UseWebContainerProps {
  templateData: TemplateFolder | null;
  autoStart?: boolean;
  projectId?: string; // 🔥 FIX #2: Add explicit project ID
}

interface UseWebContainerReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: any | null;
  isServerRunning: boolean;
  writeFileSync: (path: string, content: string) => Promise<void>;
  startServer: () => Promise<void>;
  restartServer: () => Promise<void>;
  stopServer: () => void;
}

export const useWebContainer = ({
  templateData,
  autoStart = true,
  projectId, // 🔥 FIX #2: Use this to track projects
}: UseWebContainerProps): UseWebContainerReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<any | null>(null);
  const [isServerRunning, setIsServerRunning] = useState(false);
  
  const hasInitialized = useRef(false);
  const currentProjectRef = useRef<string | null>(null);

  // Initialize WebContainer instance (once)
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const wc = await webContainerService.getInstance();
        if (mounted) {
          setInstance(wc);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to initialize WebContainer:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize");
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // 🔥 FIX #2: Setup server listener (once only)
  useEffect(() => {
    const handleServerReady = ({ url }: { port: number; url: string }) => {
      console.log("🎯 Server ready:", url);
      setServerUrl(url);
      setIsServerRunning(true);
    };

    webContainerService.on("server-ready", handleServerReady);

    return () => {
      webContainerService.off("server-ready", handleServerReady);
    };
  }, []);

  // 🔥 FIX #2: Handle project switching and mounting
  useEffect(() => {
    if (!instance || !templateData || !projectId) return;

    async function setupProject() {
      try {
        // Check if we're switching projects
        if (currentProjectRef.current !== projectId) {
          console.log(`🔄 Project switch detected: ${currentProjectRef.current} → ${projectId}`);
          
          setIsLoading(true);
          setServerUrl(null);
          setIsServerRunning(false);
          
          // Clear previous project completely
          await webContainerService.setCurrentProject(projectId);
          
          // Reset state
          hasInitialized.current = false;
          currentProjectRef.current = projectId;
        }

        // Skip if already initialized for this project
        if (hasInitialized.current && currentProjectRef.current === projectId) {
          console.log("✅ Project already initialized, skipping");
          return;
        }

        console.log(`📁 Mounting project: ${projectId}`);
        hasInitialized.current = true;

        // Mount files
        const files = transformToWebContainerFormat(templateData);
        await instance.mount(files);
        console.log("✅ Files mounted");

        // Install dependencies
        console.log("📦 Installing dependencies...");
        const exitCode = await webContainerService.installDependencies();
        
        if (exitCode !== 0) {
          throw new Error(`npm install failed with code ${exitCode}`);
        }
        console.log("✅ Dependencies installed");

        // Auto-start server
        if (autoStart) {
          console.log("🚀 Auto-starting server...");
          await startServer();
        }

        setIsLoading(false);
      } catch (err) {
        console.error("❌ Setup error:", err);
        setError(err instanceof Error ? err.message : "Setup failed");
        setIsLoading(false);
        hasInitialized.current = false;
      }
    }

    setupProject();
  }, [instance, templateData, projectId, autoStart]);

  const writeFileSync = useCallback(
    async (path: string, content: string): Promise<void> => {
      await webContainerService.writeFile(path, content);
    },
    []
  );

  const startServer = useCallback(async () => {
    if (webContainerService.isServerRunning()) {
      console.log("⚠️ Server already running");
      return;
    }

    try {
      console.log("🎬 Starting dev server...");
      // 🔥 FIX #1: Auto-detect script (no args needed)
      await webContainerService.startDevServer();
      setIsServerRunning(true);
    } catch (err) {
      console.error("Failed to start server:", err);
      setError(err instanceof Error ? err.message : "Failed to start server");
    }
  }, []);

  const restartServer = useCallback(async () => {
    try {
      console.log("🔄 Restarting server...");
      setIsServerRunning(false);
      setServerUrl(null);
      await webContainerService.restartDevServer();
    } catch (err) {
      console.error("Failed to restart server:", err);
      setError(err instanceof Error ? err.message : "Failed to restart server");
    }
  }, []);

  const stopServer = useCallback(() => {
    console.log("🛑 Stopping server...");
    webContainerService.stopDevServer();
    setIsServerRunning(false);
    setServerUrl(null);
  }, []);

  return {
    serverUrl,
    isLoading,
    error,
    instance,
    isServerRunning,
    writeFileSync,
    startServer,
    restartServer,
    stopServer,
  };
};