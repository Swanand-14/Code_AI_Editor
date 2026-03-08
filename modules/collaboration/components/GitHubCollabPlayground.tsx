"use client";
//github collab playground - the one with direct commits ,no local state ,no source control, just a simple editor with file tree and commit button, all changes are directly commited to github and reflected to all users in real time, read only for now, no conflict handling, just a simple collab editor on top of github repo
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Users,
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  GitBranch,
  Loader2,
  FileText,
  X,
  ArrowLeft,
  RefreshCw,
  GitCommit,
  Play,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { joinCollabSession } from "@/modules/collaboration/actions";
import { useCollabSocket } from "@/modules/collaboration/hooks/useCollabSocket";
import { useCollabParticipants } from "@/modules/collaboration/hooks/useCollabParticipants";
import type { CollabSessionData } from "@/modules/collaboration/types";
import { LoadingStep } from "@/modules/playground/components/loader";
import { currentUser } from "@/modules/auth/actions";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { GitHubFileTree } from "@/modules/github/components/github-file-tree";
import { fetchRepositoryTree, fetchFileContent } from "@/modules/github/actions";
import { CollabEditor } from "./CollabEditor";
import { getEditorLanguage } from "@/modules/playground/lib/editor-config";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TerminalComponent, { TerminalRef } from "@/modules/webContainers/components/terminal";
import { WebContainerPreview } from "@/modules/webContainers/components/WebContainerPreview";

// Workspace layer — same as single-user playground
import {
  useGitWorkspace,
  useActiveFile,
  useChangeCount,
} from "@/modules/github/hooks/Usegitworkspace";
import { useWebContainerForGithub } from "@/modules/webContainers/hooks/useWebContainerForGithub";
import { NewFileDialog } from "@/modules/github/components/dialogs/new-file-dialog";
import { NewFolderDialog } from "@/modules/github/components/dialogs/new-folder-dialog";
import { SourceControlPanel } from "@/modules/github/components/SourceControlPanel";
import { DiffViewer } from "@/modules/github/components/diff-viewer";
import { commitAllChangesToGitHub } from "@/modules/github/actions";
import PlaygroundEditor from "@/modules/playground/components/playgroundEditor";

// Phase 1 collab bridge
import { useCollabWorkspace } from "@/modules/collaboration/hooks/useCollabWorkspace";
interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size: number;
  content?: string;
}


interface GitHubCollabPlaygroundProps {
  session: CollabSessionData;
}

export function GitHubCollabPlayground({ session }: GitHubCollabPlaygroundProps) {
 
  const [user, setUser] = useState<{
    id: string;
    name: string;
    image?: string;
  } | null>(null);
    const [isJoining, setIsJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Derived: is this user the session host?
  const isHost = !!user && user.id === session.hostId;

  // ── UI state ────────────────────────────────────────────────────────────
  const [showSourceControl, setShowSourceControl] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [currentContextPath, setCurrentContextPath] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<GitHubFile | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set([""])
  );
  const [showDiff, setShowDiff] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  const terminalRef = useRef<TerminalRef>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const autoStartAttempted = useRef(false);
  const manuallyCreatedFilesRef = useRef<Set<string>>(new Set());

    const {socket,isConnected, emitFileOpen } = useCollabSocket(
        session.sessionId,
        user?.id,
        user?.name
    )

    const {participants,activityLogs,updateActivity} = useCollabParticipants({
        socket,sessionId:session.sessionId,
        currentUserId:user?.id,

    });
    const {
    files,
    initializeWorkspace,
    openFile: openFileInWorkspace,
    closeFile,
    updateFileContent,
    getAllChanges,
    modifiedFiles,
    createdFiles,
    deletedFiles,
    addFileToTree,
    removeFileFromTree,
    updateFileInTree,
    markFileCreated,
    markFileDeleted,
    unmarkFileCreated,
    unstageAllFiles,
  } = useGitWorkspace();

  const activeFile  = useActiveFile();
  const changeCount = useChangeCount();
  const openFiles   = useGitWorkspace((s) => s.openFiles);
  const remoteState = useGitWorkspace((s) => s.remoteState);

  const {
    broadcastContentChange,
    broadcastFileCreate,
    broadcastFileDelete,
    broadcastFileRename,
  } = useCollabWorkspace({
    socket,
    sessionId: session.sessionId,
    currentUserId: user?.id,
  });

  const {
    serverUrl,
    isLoading: isWebContainerLoading,
    error: webContainerError,
    instance: webContainerInstance,
    isServerRunning,
    isSupported: isWebContainerSupported,
    projectType,
    startServer,
    restartServer,
    stopServer,
    isReady,
  } = useWebContainerForGithub({
    files,
    repoFullName: `${session.repoOwner}/${session.repoName}`,
    currentBranch: session.branch,
    terminalRef,
    autoStart: false,
  });


    const loadRepositoryTree = useCallback(async () => {
    if (!session.repoOwner || !session.repoName || !session.branch) {
      toast.error("Repository information missing");
      return;
    }

    setIsLoadingTree(true);
    try {
      console.log(`📦 Fetching tree for ${session.repoOwner}/${session.repoName}@${session.branch}`);
      
      const result = await fetchRepositoryTree(
        session.repoOwner,
        session.repoName,
        session.branch
      );

      if (result.success) {
       const filesWithContent = await Promise.all(
          result.data.map(async (file: GitHubFile) => {
            if (file.type === "file") {
              const contentResult = await fetchFileContent(
                session.repoOwner!,
                session.repoName!,
                file.path,
                session.branch
              );
              if (contentResult.success) {
                return { ...file, content: contentResult.data };
              }
            }
            return file;
          })
        );

        initializeWorkspace(
          `${session.repoOwner}/${session.repoName}`,
          session.branch,
          filesWithContent
        );

      } else {
        toast.error(result.error || "Failed to load repository");
        console.error("❌ Tree fetch error:", result.error);
      }
    } catch (error) {
      console.error("❌ Error loading tree:", error);
      toast.error("Failed to load repository files");
    } finally {
      setIsLoadingTree(false);
    }
  }, [session.repoOwner, session.repoName, session.branch,initializeWorkspace]);

  






    useEffect(()=>{
        let mounted = true;
        const join = async () => {
            try {
                console.log("Starting join Process for GitHub Session",session.sessionId);
                const currentUserData = await currentUser()
                if(!mounted)return;
                setUser(currentUserData?{id:currentUserData.id!,name:currentUserData.name!,image:currentUserData.image}:null);
                const result = await joinCollabSession(session.sessionId);
                if(!mounted)return;
                if(!result.success){
                    setJoinError(result.error || "Failed to join session");
                    toast.error(result.error)
                    setIsJoining(false)
                    return;
                }

                if(mounted){
                    toast.success("Successfully joined Github Collaboration session");
                }
                await loadRepositoryTree();
            } catch (error) {
                console.error("❌ Error joining session:", error);
        if (mounted) {
          setJoinError("An error occurred while joining");
          toast.error("Failed to join session");
        }
            }finally{
                if (mounted) {
          setIsJoining(false);
        }
            }
        }

        join();
        return () => {
      mounted = false;
    };
    },[session.sessionId,loadRepositoryTree]);

    useEffect(() => {
    const handleTerminalReady = () => setIsTerminalReady(true);
    window.addEventListener("terminalReady", handleTerminalReady);
    return () => window.removeEventListener("terminalReady", handleTerminalReady);
  }, []);
  useEffect(() => {
    if (
      !isWebContainerSupported ||
      !isReady ||
      !isTerminalReady ||
      autoStartAttempted.current ||
      isServerRunning
    )
      return;

    autoStartAttempted.current = true;
    const timer = setTimeout(async () => {
      try {
        await startServer();
        setShowPreview(true);
      } catch {
        autoStartAttempted.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isReady, isTerminalReady, isServerRunning, isWebContainerSupported, startServer]);
  const handleFileSelect = useCallback(
    async (file: GitHubFile) => {
      if (file.type === "dir") return;

      openFileInWorkspace(file);
      emitFileOpen(file.sha || file.path, file.path);
      updateActivity(file.path);

      // Mirror into WebContainer
      if (webContainerInstance && isReady) {
        const content = file.content || "";
        await webContainerInstance.fs.writeFile(`/${file.path}`, content, "utf-8");
      }
    },
    [openFileInWorkspace, emitFileOpen, updateActivity, webContainerInstance, isReady]
  );
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!activeFile) return;

      updateFileContent(activeFile.path, newContent);

      // Broadcast to peers (Phase 1 — full content, no deltas)
      broadcastContentChange(activeFile.path, activeFile.sha, newContent);

      // Mirror into own WebContainer
      if (isWebContainerSupported && webContainerInstance) {
        webContainerInstance.fs
          .writeFile(`/${activeFile.path}`, newContent, "utf-8")
          .catch(console.error);
      }
    },
    [
      activeFile,
      updateFileContent,
      broadcastContentChange,
      isWebContainerSupported,
      webContainerInstance,
    ]
  );
  const handleCreateFile = useCallback(
    async (path: string, filename: string) => {
      const fullPath = path ? `${path}/${filename}` : filename;

      if (files.some((f) => f.path === fullPath)) {
        toast.error(`File "${filename}" already exists`);
        return;
      }

      const newFile: GitHubFile = {
        name: filename,
        path: fullPath,
        sha: "",
        size: 0,
        type: "file",
        content: "",
      };

      addFileToTree(newFile);
      markFileCreated(fullPath);

      if (path) setExpandedDirs((prev) => new Set([...prev, path]));
      openFileInWorkspace(newFile);

      if (webContainerInstance && isReady) {
        await webContainerInstance.fs.writeFile(`/${fullPath}`, "", "utf-8");
      }

      // Broadcast to peers
      broadcastFileCreate(fullPath, "");

      toast.success(`Created ${filename}`, {
        description: "Stage and commit when ready",
      });
    },
    [
      files,
      addFileToTree,
      markFileCreated,
      openFileInWorkspace,
      webContainerInstance,
      isReady,
      broadcastFileCreate,
    ]
  );
  const handleCreateFolder = useCallback(
    async (path: string, folderName: string) => {
      const fullPath = path ? `${path}/${folderName}` : folderName;
      const gitkeepPath = `${fullPath}/.gitkeep`;

      if (files.some((f) => f.path === gitkeepPath)) {
        toast.error(`Folder "${folderName}" already exists`);
        return;
      }

      const placeholder: GitHubFile = {
        name: ".gitkeep",
        path: gitkeepPath,
        sha: "",
        size: 0,
        type: "file",
        content: "",
      };

      addFileToTree(placeholder);
      markFileCreated(gitkeepPath);
      setExpandedDirs((prev) =>
        new Set([...prev, ...(path ? [path] : []), fullPath])
      );

      if (webContainerInstance && isReady) {
        await webContainerInstance.fs.mkdir(`/${fullPath}`, { recursive: true });
        await webContainerInstance.fs.writeFile(`/${gitkeepPath}`, "", "utf-8");
      }

      // Broadcast the .gitkeep creation so peers see the folder too
      broadcastFileCreate(gitkeepPath, "");

      toast.success(`Created ${folderName}/`, {
        description: "Stage and commit when ready",
      });
    },
    [
      files,
      addFileToTree,
      markFileCreated,
      webContainerInstance,
      isReady,
      broadcastFileCreate,
    ]
  );
  const handleDeleteFile = useCallback(async () => {
    if (!fileToDelete) return;

    const isLocalOnly = !fileToDelete.sha;

    if (activeFile?.path === fileToDelete.path) closeFile(fileToDelete.path);

    if (isLocalOnly) {
      removeFileFromTree(fileToDelete.path);
      unmarkFileCreated(fileToDelete.path);
    } else {
      removeFileFromTree(fileToDelete.path);
      markFileDeleted(fileToDelete.path);
    }

    if (webContainerInstance && isReady) {
      try {
        await webContainerInstance.fs.rm(`/${fileToDelete.path}`);
      } catch {}
    }

    // Broadcast deletion
    broadcastFileDelete(fileToDelete.path);

    setDeleteDialogOpen(false);
    setFileToDelete(null);
    toast.success(`Deleted ${fileToDelete.name}`);
  }, [
    fileToDelete,
    activeFile,
    closeFile,
    removeFileFromTree,
    unmarkFileCreated,
    markFileDeleted,
    webContainerInstance,
    isReady,
    broadcastFileDelete,
  ]);
  const handleDeleteFolder = useCallback(async () => {
    if (!folderToDelete) return;

    const folderFiles = files.filter(
      (f) =>
        f.path.startsWith(folderToDelete.path + "/") ||
        f.path === folderToDelete.path
    );

    if (activeFile?.path.startsWith(folderToDelete.path + "/")) {
      closeFile(activeFile.path);
    }

    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.delete(folderToDelete.path);
      Array.from(next).forEach((p) => {
        if (p.startsWith(folderToDelete.path + "/")) next.delete(p);
      });
      return next;
    });

    folderFiles.forEach((file) => {
      removeFileFromTree(file.path);
      if (!file.sha) {
        unmarkFileCreated(file.path);
      } else {
        markFileDeleted(file.path);
      }
      // Broadcast each file deletion
      broadcastFileDelete(file.path);
    });

    if (webContainerInstance && isReady) {
      try {
        await webContainerInstance.fs.rm(`/${folderToDelete.path}`, {
          recursive: true,
        });
      } catch {}
    }

    setDeleteFolderDialogOpen(false);
    setFolderToDelete(null);
    toast.success(`Deleted ${folderToDelete.name}/`);
  }, [
    folderToDelete,
    files,
    activeFile,
    closeFile,
    removeFileFromTree,
    unmarkFileCreated,
    markFileDeleted,
    webContainerInstance,
    isReady,
    broadcastFileDelete,
  ]);

  const handleRenameFile = useCallback(
    async (file: GitHubFile, newName: string) => {
      const dir = file.path.includes("/")
        ? file.path.substring(0, file.path.lastIndexOf("/"))
        : "";
      const newPath = dir ? `${dir}/${newName}` : newName;

      if (files.some((f) => f.path === newPath)) {
        toast.error(`"${newName}" already exists`);
        return;
      }

      // --- Old path: delete side ---
      if (activeFile?.path === file.path) closeFile(file.path);
      removeFileFromTree(file.path);
      if (!file.sha) {
        unmarkFileCreated(file.path);
      } else {
        markFileDeleted(file.path);
      }

      // --- New path: add side ---
      const currentContent =
        openFiles.find((f) => f.path === file.path)?.content ??
        file.content ??
        "";

      const newFile: GitHubFile = {
        name: newName,
        path: newPath,
        sha: "",
        size: currentContent.length,
        type: "file",
        content: currentContent,
      };

      addFileToTree(newFile);
      markFileCreated(newPath);
      openFileInWorkspace(newFile);

      // WebContainer
      if (webContainerInstance && isReady) {
        try {
          const dirPart = newPath.split("/").slice(0, -1).join("/");
          if (dirPart)
            await webContainerInstance.fs.mkdir(`/${dirPart}`, {
              recursive: true,
            });
          await webContainerInstance.fs.writeFile(
            `/${newPath}`,
            currentContent,
            "utf-8"
          );
          await webContainerInstance.fs.rm(`/${file.path}`);
        } catch (e) {
          console.warn("WC rename sync failed:", e);
        }
      }

      // Broadcast rename
      broadcastFileRename(file.path, newPath, currentContent);

      toast.success(`Renamed to ${newName}`, {
        description: "Staged as D + A. Commit via Source Control.",
      });
    },
    [
      files,
      activeFile,
      openFiles,
      closeFile,
      removeFileFromTree,
      unmarkFileCreated,
      markFileDeleted,
      addFileToTree,
      markFileCreated,
      openFileInWorkspace,
      webContainerInstance,
      isReady,
      broadcastFileRename,
    ]
  );
  const handleCommit = useCallback(
    async (message: string, description?: string) => {
      if (!message.trim()) {
        toast.error("Please enter a commit message");
        return;
      }
      if (!isHost) {
        toast.error("Only the host can commit changes");
        return;
      }

      setIsSaving(true);
      try {
        const changes = getAllChanges();
        if (changes.length === 0) {
          toast.error("No changes to commit");
          return;
        }

        const fullMessage = description?.trim()
          ? `${message}\n\n${description}`
          : message;

        const result = await commitAllChangesToGitHub(
          session.repoOwner!,
          session.repoName!,
          changes,
          fullMessage,
          session.branch
        );

        if (result.success) {
          toast.success(`Committed ${changes.length} file(s)`);
          initializeWorkspace(
            `${session.repoOwner}/${session.repoName}`,
            session.branch,
            result.updatedFiles
          );
          await loadRepositoryTree();
        } else {
          toast.error(result.error || "Failed to commit changes");
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      isHost,
      getAllChanges,
      initializeWorkspace,
      loadRepositoryTree,
      session.repoOwner,
      session.repoName,
      session.branch,
    ]
  );

    

   if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Joining GitHub Collaboration
          </h2>
          <div className="mb-8">
            <LoadingStep currentStep={1} step={1} label="Connecting to session" />
            <LoadingStep currentStep={2} step={2} label="Setting up workspace" />
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

  const expiresAt = new Date(session.expiresAt);
  const hoursRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))
  );

  // ── Sidebar tabs: hosts see Explorer + Source Control; guests only Explorer
  const sidebarTabs = isHost ? ["Explorer", "Source Control"] : ["Explorer"];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-64 border-r bg-muted/30 overflow-auto flex flex-col">
        {/* Tab bar — host sees both tabs, guest sees only Explorer */}
        <div className="flex border-b">
          <button
            className={`flex-1 py-2 text-sm ${
              !showSourceControl
                ? "bg-background border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
            onClick={() => setShowSourceControl(false)}
          >
            Explorer
          </button>

          {isHost && (
            <button
              className={`flex-1 py-2 text-sm ${
                showSourceControl
                  ? "bg-background border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
              onClick={() => setShowSourceControl(true)}
            >
              Source Control
              {changeCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-500 text-white">
                  {changeCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Explorer panel */}
        {!showSourceControl ? (
          <>
            <div className="p-4 border-b space-y-3">
              <div>
                <h2 className="font-semibold">{session.repoName}</h2>
                <p className="text-xs text-muted-foreground">
                  {session.repoOwner}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span>{session.branch}</span>
                {!isHost && (
                  <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">
                    read-only branch
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={loadRepositoryTree}
                disabled={isLoadingTree}
                className="h-6 w-6"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isLoadingTree ? "animate-spin" : ""}`}
                />
              </Button>

              {/* WebContainer status */}
              {isWebContainerSupported && (
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isServerRunning ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      <span className="text-xs font-medium">
                        {isServerRunning
                          ? `${projectType} (Running)`
                          : projectType || "Web Project"}
                      </span>
                    </div>
                  </div>

                  {isServerRunning && (
                    <>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={stopServer}
                          className="flex-1"
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Stop
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={restartServer}
                          className="flex-1"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Restart
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full"
                      >
                        {showPreview ? "Hide" : "Show"} Preview
                      </Button>
                    </>
                  )}

                  {!isServerRunning && isWebContainerLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Starting server...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Guest role badge */}
              {!isHost && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    You are a{" "}
                    <span className="font-medium text-foreground">guest</span>.
                    Edits sync to all participants.
                  </p>
                </div>
              )}
            </div>

            {/* File tree */}
            <div className="flex-1 overflow-auto">
              {isLoadingTree ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <GitHubFileTree
                  files={files}
                  onFileSelect={handleFileSelect}
                  selectedPath={activeFile?.path}
                  onCreateFile={(path) => {
                    setCurrentContextPath(path);
                    setNewFileDialogOpen(true);
                  }}
                  onCreateFolder={(path) => {
                    setCurrentContextPath(path);
                    setNewFolderDialogOpen(true);
                  }}
                  onDeleteFile={(file) => {
                    setFileToDelete(file);
                    setDeleteDialogOpen(true);
                  }}
                  onDeleteFolder={(path, name) => {
                    setFolderToDelete({ path, name });
                    setDeleteFolderDialogOpen(true);
                  }}
                  expandedDirs={expandedDirs}
                  onExpandedDirsChange={setExpandedDirs}
                  modifiedFiles={modifiedFiles}
                  createdFiles={createdFiles}
                  deletedFiles={deletedFiles}
                  onRenameFile={handleRenameFile}
                />
              )}
            </div>
          </>
        ) : (
          // Source Control — host only (tab is hidden from guests, but guard anyway)
          isHost && (
            <SourceControlPanel
              onCommit={handleCommit}
              onViewDiff={(filePath) => {
                const file = files.find((f) => f.path === filePath);
                if (file) openFileInWorkspace(file);
                setDiffFilePath(filePath);
                setShowDiff(true);
              }}
              isCommitting={isSaving}
            />
          )
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold">GitHub Collaboration</h1>
                <p className="text-xs text-muted-foreground">
                  {session.repoOwner}/{session.repoName} • {session.branch}
                  {isHost && (
                    <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                      Host
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Active file info */}
            {activeFile && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {activeFile.path.split("/").pop()}
                </span>
                {activeFile.hasChanges && (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                    <span>Modified</span>
                  </div>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-4">
              {/* Connection status */}
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

              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="text-sm">{participants.length} online</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Expires in {hoursRemaining}h</span>
              </div>
            </div>
          </div>
        </header>

        {/* Participants bar */}
        {participants.length > 0 && (
          <div className="border-b bg-muted/10 px-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              {participants.map((participant, index) => (
                <div
                  key={`${participant.userId}-${index}`}
                  className="flex items-center gap-1 px-2 py-1 bg-background rounded text-sm border"
                >
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>{participant.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({participant.role})
                  </span>
                  {participant.activeFile && (
                    <span className="text-xs text-muted-foreground ml-1">
                      • {participant.activeFile.split("/").pop()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editor area */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={showPreview ? 50 : 100} minSize={30}>
            <div className="flex flex-col h-full">
              {showDiff && diffFilePath ? (
                <DiffViewer
                  originalContent={remoteState.get(diffFilePath) ?? ""}
                  modifiedContent={
                    openFiles.find((f) => f.path === diffFilePath)?.content ??
                    remoteState.get(diffFilePath) ??
                    ""
                  }
                  filepath={diffFilePath}
                  onClose={() => {
                    setShowDiff(false);
                    setDiffFilePath(null);
                  }}
                />
              ) : activeFile ? (
                <PlaygroundEditor
                  activeFile={{
                    filename:
                      activeFile.path.split("/").pop()?.split(".")[0] || "file",
                    fileExtension:
                      activeFile.path.split(".").pop() || "txt",
                    content: activeFile.content,
                  }}
                  content={activeFile.content}
                  onContentChange={handleContentChange}
                  suggestionLoading={false}
                  suggestions={null}
                  suggestionPosition={null}
                  onAcceptSuggestion={() => {}}
                  onRejectSuggestion={() => {}}
                  onTriggerSuggestion={() => {}}
                  disableAI={true}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <GitBranch className="h-16 w-16 mb-4" />
                  <p className="text-lg">Select a file to start editing</p>
                  <p className="text-sm mt-2">
                    Editing on branch:{" "}
                    <span className="font-mono">{session.branch}</span>
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm text-green-700 font-medium">
                      {participants.length}{" "}
                      {participants.length === 1 ? "person" : "people"} connected
                    </span>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>

          {isWebContainerSupported && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={50} minSize={30}>
                <WebContainerPreview
                  serverUrl={serverUrl}
                  isLoading={isWebContainerLoading}
                  error={webContainerError}
                  instance={webContainerInstance}
                  onRestartServer={restartServer}
                  terminalRef={terminalRef}
                  showTerminal={true}
                  onServerReady={(url) => {
                    console.log("📡 Server ready:", url);
                  }}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Participants & Activity Panel (reused from original) */}
      <ParticipantsPanel
        participants={participants}
        activityLogs={activityLogs}
        currentUserId={user?.id}
        followingUserId={null}
        onFollowToggle={() => {}}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <NewFileDialog
        open={newFileDialogOpen}
        onOpenChange={setNewFileDialogOpen}
        onCreateFile={handleCreateFile}
        currentPath={currentContextPath}
      />

      <NewFolderDialog
        open={newFolderDialogOpen}
        onOpenChange={setNewFolderDialogOpen}
        onCreateFolder={handleCreateFolder}
        currentPath={currentContextPath}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{fileToDelete?.name}</strong>?
              {fileToDelete?.sha
                ? " This will stage the deletion — commit via Source Control to apply to GitHub."
                : " This file only exists locally and will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteFolderDialogOpen}
        onOpenChange={setDeleteFolderDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{folderToDelete?.name}</strong> and all its contents?
              Files on GitHub will be staged for deletion and must be committed
              via Source Control.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );


   
}