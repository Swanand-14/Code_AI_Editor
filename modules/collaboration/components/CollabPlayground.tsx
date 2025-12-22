"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Clock, AlertCircle, Wifi, WifiOff, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { joinCollabSession } from "../actions";
import { useCollabSocket } from "../hooks/useCollabSocket";
import type { CollabSessionData } from "../types";
import { LoadingStep } from "@/modules/playground/components/loader";
import { currentUser } from "@/modules/auth/actions";
import { CollabEditor } from "./CollabEditor";
import { TemplateFile } from "@prisma/client";
import { enrichTemplateWithPaths } from "@/modules/playground/lib";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { TemplateFileTree } from "@/modules/playground/components/playgroundExplorer";
import { SidebarProvider } from "@/components/ui/sidebar";

interface CollabPlaygroundProps {
  session: CollabSessionData;
}

// 🎯 SAMPLE TEMPLATE FOR TESTING
const SAMPLE_TEMPLATE: TemplateFolder = {
  folderName: "Root",
  items: [
    {
      id: "1",
      filename: "App",
      fileExtension: "tsx",
      content: `export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Hello Collaboration! 🎉</h1>
      <p>Start typing to see real-time updates...</p>
    </div>
  );
}`,
      path: "",
    },
    {
      id: "2",
      filename: "index",
      fileExtension: "css",
      content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}`,
      path: "",
    },
    {
      folderName: "components",
      items: [
        {
          id: "3",
          filename: "Button",
          fileExtension: "tsx",
          content: `interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export default function Button({ children, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      {children}
    </button>
  );
}`,
          path: "components",
        },
        {
          id: "4",
          filename: "Header",
          fileExtension: "tsx",
          content: `export default function Header() {
  return (
    <header className="bg-gray-800 text-white p-4">
      <h1 className="text-xl">My App</h1>
    </header>
  );
}`,
          path: "components",
        },
      ],
    },
    {
      folderName: "utils",
      items: [
        {
          id: "5",
          filename: "helpers",
          fileExtension: "ts",
          content: `export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`,
          path: "utils",
        },
      ],
    },
    {
      id: "6",
      filename: "README",
      fileExtension: "md",
      content: `# Collaboration Demo

This is a sample project for testing real-time collaboration.

## Features
- Real-time editing
- Multiple users
- WebSocket sync

Try editing any file and watch it update in other windows!`,
      path: "",
    },
  ],
};

export function CollabPlayground({ session }: CollabPlaygroundProps) {
  const [isJoining, setIsJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [templateData, setTemplateData] = useState<TemplateFolder | null>(null);
  const [openFiles, setOpenFiles] = useState<Array<TemplateFile & { path?: string }>>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Initialize WebSocket connection
  const { isConnected, participants, emitFileOpen } = useCollabSocket(
    session.sessionId,
    user?.id,
    user?.name
  );

  useEffect(() => {
    const join = async () => {
      try {
        // Get current user
        const currentUserData = await currentUser();
        setUser(currentUserData ? { id: currentUserData.id!, name: currentUserData.name! } : null);

        // Join session
        const result = await joinCollabSession(session.sessionId);

        if (!result.success) {
          setJoinError(result.error || "Failed to join session");
          toast.error(result.error);
          setIsJoining(false);
          return;
        }

        // 🎯 Load sample template for testing
        console.log("📦 Loading sample template for testing");
        const enrichedTemplate = enrichTemplateWithPaths(SAMPLE_TEMPLATE);
        setTemplateData(enrichedTemplate);
        console.log("✅ Sample template loaded");

        // Auto-open first file (App.tsx)
        const firstFile = findFirstFile(enrichedTemplate);
        if (firstFile) {
          console.log("📄 Auto-opening first file:", firstFile.filename);
          handleFileSelect(firstFile);
        }

        toast.success("Successfully joined collaboration session!");
      } catch (error) {
        console.error("❌ Error joining session:", error);
        setJoinError("An error occurred while joining");
        toast.error("Failed to join session");
      } finally {
        setIsJoining(false);
      }
    };

    join();
  }, [session.sessionId]);

  // Helper to find first file in template
  const findFirstFile = (folder: TemplateFolder): (TemplateFile & { path?: string }) | null => {
    for (const item of folder.items) {
      if ("folderName" in item) {
        const found = findFirstFile(item);
        if (found) return found;
      } else {
        return item as TemplateFile & { path?: string };
      }
    }
    return null;
  };

  // Handle file selection
  const handleFileSelect = useCallback((file: TemplateFile & { path?: string }) => {
    console.log("📄 File selected:", file);
    
    // Add to open files if not already open
    if (!openFiles.find((f) => f.id === file.id)) {
      setOpenFiles((prev) => [...prev, file]);
    }
    
    setActiveFileId(file.id);
    
    // Emit file open event
    const filePath = `${file.path || ""}/${file.filename}.${file.fileExtension}`.replace(/^\//, "");
    emitFileOpen(file.id, filePath);
  }, [openFiles, emitFileOpen]);

  // Close file
  const closeFile = useCallback((fileId: string) => {
    setOpenFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== fileId);
      
      // If closing active file, switch to another
      if (activeFileId === fileId && filtered.length > 0) {
        setActiveFileId(filtered[0].id);
      } else if (filtered.length === 0) {
        setActiveFileId(null);
      }
      
      return filtered;
    });
  }, [activeFileId]);

  if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Joining Collaboration Session
          </h2>
          <div className="mb-8">
            <LoadingStep currentStep={1} step={1} label="Connecting to session" />
            <LoadingStep currentStep={2} step={2} label="Loading playground" />
            <LoadingStep currentStep={3} step={3} label="Ready to collaborate" />
          </div>
        </div>
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Failed to Join</h1>
        <p className="text-muted-foreground mb-6">{joinError}</p>
      </div>
    );
  }

  // Calculate time remaining
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const hoursRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  const activeFile = openFiles.find((f) => f.id === activeFileId);

  // Determine language from file extension
  const getLanguage = (extension: string): string => {
    const map: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      html: "html",
      css: "css",
      scss: "scss",
      py: "python",
      md: "markdown",
    };
    return map[extension] || "plaintext";
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        {/* File Explorer Sidebar */}
        {templateData && (
          <TemplateFileTree
            data={templateData}
            onFileSelect={handleFileSelect}
            selectedFile={activeFile}
            title="Files (Demo)"
            // Disable editing in collab mode
            onAddFile={() => toast.info("File editing disabled in demo mode")}
            onAddFolder={() => toast.info("File editing disabled in demo mode")}
            onDeleteFile={() => toast.info("File editing disabled in demo mode")}
            onDeleteFolder={() => toast.info("File editing disabled in demo mode")}
            onRenameFile={() => toast.info("File editing disabled in demo mode")}
            onRenameFolder={() => toast.info("File editing disabled in demo mode")}
          />
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Collaboration Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <div className="flex flex-1 items-center gap-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <h1 className="font-semibold">Collaboration Demo</h1>
                  <p className="text-xs text-muted-foreground">
                    Session: {session.sessionId}
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-4">
                {/* Connection Status */}
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <Wifi className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-600">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-600">Disconnected</span>
                    </>
                  )}
                </div>

                {/* Participants */}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">{participants.length} online</span>
                </div>

                {/* Expiry */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Expires in {hoursRemaining}h</span>
                </div>
              </div>
            </div>
          </header>

          {/* Participants List */}
          {participants.length > 0 && (
            <div className="border-b bg-muted/10 px-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                {participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="flex items-center gap-1 px-2 py-1 bg-background rounded text-sm border"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>{participant.userName}</span>
                    <span className="text-xs text-muted-foreground">({participant.role})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Tabs */}
          {openFiles.length > 0 && (
            <div className="border-b border-border bg-muted/30">
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {openFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => setActiveFileId(file.id)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-t-md cursor-pointer border-b-2 transition-all ${
                        activeFileId === file.id
                          ? "border-primary bg-background"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <FileText className="h-3 w-3" />
                      <span className="text-sm">
                        {file.filename}.{file.fileExtension}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeFile(file.id);
                        }}
                        className="ml-1 hover:bg-destructive hover:text-white rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {openFiles.length > 1 && (
                  <button
                    onClick={() => {
                      setOpenFiles([]);
                      setActiveFileId(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Close All
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Editor Area */}
          <div className="flex-1 overflow-hidden">
            {activeFile ? (
              <CollabEditor
                sessionId={session.sessionId}
                userId={user?.id}
                userName={user?.name || "Anonymous"}
                fileId={activeFile.id}
                filePath={`${activeFile.path || ""}/${activeFile.filename}.${activeFile.fileExtension}`.replace(/^\//, "")}
                initialContent={typeof activeFile.content === "string" ? activeFile.content : ""}
                language={getLanguage(activeFile.fileExtension || "")}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No files open. Select a file from the sidebar.
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}