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
import { useWorkspaceAutosave } from "../../github/hooks/useWorkspaceAutoSave";
import { useRestoreDraft } from "@/modules/github/hooks/useRestoreDraft";
import { useRemoteCursors } from "../hooks/useRemoteCursors";
import { useProximityWarnings } from "../hooks/useProximityWarnings";
import { editor } from "monaco-editor";
import { set } from "zod";
import type {GitHubFile} from "../../github/types";
import { fileCreationWatcher } from "@/modules/webContainers/services/fileWatcher";




interface GitHubCollabPlaygroundProps {
  session: CollabSessionData;
}

export function GitHubCollabPlayground({ session }: GitHubCollabPlaygroundProps) {
 
  const [user, setUser] = useState<{ id: string; name: string; image?: string | null } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  // Derived: is this user the session host?
  const isHost = !!user && user.id === session.hostId;

  
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
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  const terminalRef = useRef<TerminalRef>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const autoStartAttempted = useRef(false);
  const manuallyCreatedFilesRef = useRef<Set<string>>(new Set());
  const needsSnapshotRef = useRef(false);
  const snapshotResolveRef = useRef<(()=>void | null)>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState(0);
const [snapshotReceivedAt, setSnapshotReceivedAt] = useState(0);

const [localCursorPosition, setLocalCursorPosition] = useState<{lineNumber: number; column: number}>({lineNumber: 1, column: 1});
const [hostNotPresent,setHostNotPresent] = useState(false);
const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);

const hostNotPresentRef = useRef(false);



    const {socket,isConnected, emitFileOpen,emitCursorMove } = useCollabSocket(
        session.sessionId,
        user?.id,
        user?.name,
        (message,details) => {
          if(message === "HOST_NOT_PRESENT"){
            setHostNotPresent(true);
            setIsJoining(false);
            setHostNotPresent(true);
          }
        }
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
    currentBranch: session.branch??"main",
    terminalRef,
    autoStart: false,
     
  });

  const {
    broadcastContentChange,
    broadcastFileCreate,
    broadcastFileDelete,
    broadcastFileRename,
    broadcastFileRestore,
    requestSnapshot,

  } = useCollabWorkspace({
    socket,
    sessionId: session.sessionId,
    currentUserId: user?.id,
    isHost,
     webContainerInstance,  // ← ADD
  isReady,  
  });
  const { remoteCursors, CursorsInCurrentFile } = useRemoteCursors({
  socket,
  sessionId: session.sessionId,
  currentUserId: user?.id,
  currentFileId: activeFile?.sha || activeFile?.path,
});

useProximityWarnings({
  remoteCursors: CursorsInCurrentFile,
  localCursorLine: localCursorPosition.lineNumber,
  enabled: true,
});

  useWorkspaceAutosave({
    repoFullName: `${session.repoOwner}/${session.repoName}`,
    currentBranch: session.branch??"main",
    enabled: isHost, // Only host triggers autosave (which in this case is direct commit)
    sessionId: session.sessionId,
  })

  const {restoreDraft} = useRestoreDraft();


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

      if (result.success && result.data) {
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
                 const isCurrentUserHost = currentUserData?.id === session.hostId;
                const result = await joinCollabSession(session.sessionId);
                if(!mounted)return;
                if (!result.success) {
          // Session expired/dead — guests see an error, host gets crash recovery
          if (!isCurrentUserHost) {
            setJoinError(result.error || "Session has expired");
            toast.error(result.error);
            return;
          }
          // Host: fall through — load tree + restore draft below
          console.log("💾 [Draft] Session expired — host entering crash recovery mode");
          toast.info("Session has ended — restoring your last saved draft");
        } else {
          if (mounted) toast.success("Successfully joined Github Collaboration session");
        }
        if (!isCurrentUserHost) {
        const hostCheckPassed = await new Promise<boolean>((resolve) => {
          // If already flagged before this point, bail immediately
          if (hostNotPresentRef.current) {
            resolve(false);
            return;
          }

          const TIMEOUT = 10000;

          const onJoined = () => {
            clearTimeout(timer);
            cleanup();
            resolve(true);
          };

          const onError = (data: { message: string }) => {
            if (data.message === "HOST_NOT_PRESENT") {
              clearTimeout(timer);
              cleanup();
              resolve(false);
            }
          };

          const cleanup = () => {
            socket?.off("collab:joined", onJoined);
            socket?.off("collab:error", onError);
          };

          const timer = setTimeout(() => {
            cleanup();
            resolve(true); // timeout = assume ok, proceed with GitHub fallback
          }, TIMEOUT);

          socket?.on("collab:joined", onJoined);
          socket?.on("collab:error", onError);
        });

        if (!hostCheckPassed) {
          console.log("❌ [Join] Host not present — aborting join");
          return; // stop here, UI already shows hostNotPresent screen
        }
      }

        // Always load the clean GitHub base first
        await loadRepositoryTree();
        if (!mounted) return;

        // Host always restores draft on top of clean GitHub state.
        //
        // Why always — not just when session is dead:
        //   The socket room has zero persistence. The WorkspaceDraft is the
        //   ONLY storage of uncommitted changes (modified, created, deleted files).
        //   Whether the session is live or expired, the draft is always the
        //   correct uncommitted state to layer on top of the GitHub tree.
        //   If no draft exists (first join or post-commit), restoreDraft is a
        //   no-op and the clean GitHub tree is the starting state.
        if (isCurrentUserHost) {
          await restoreDraft(
            `${session.repoOwner}/${session.repoName}`,
            session.branch ?? "main",
            webContainerInstance ?? null,
            session.sessionId
            
          );
          setDraftRestoredAt(prev => prev + 1);
        }else{
           console.log("[snapshot] Guest flagging snapshot needed");
           needsSnapshotRef.current = true;
           setSnapshotPending(true);
  
        }
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
  useEffect(() => {
  // Only run for guests, only when socket becomes ready
  if (isHost || !socket || !needsSnapshotRef.current || !snapshotPending) return;


  console.log("[snapshot] Socket ready — sending snapshot request");
  needsSnapshotRef.current = false;
  setSnapshotPending(false);

  const TIMEOUT_MS = 8000;

  const cleanup = () => {
    socket.off("workspace:snapshot", onSnapshot);
    socket.off("workspace:snapshot-unavailable", onFallback);
  };

  const onSnapshot = () => {
    clearTimeout(timer);
    cleanup();
    console.log("✅ [Snapshot] Received host snapshot");
    setSnapshotReceivedAt(prev => prev + 1);
    
  };

  const onFallback = () => {
    clearTimeout(timer);
    cleanup();
    console.log("⚠️ [Snapshot] Host unavailable — falling back");
    loadRepositoryTree();
  };

  const timer = setTimeout(() => {
    cleanup();
    console.log("⏱️ [Snapshot] Timeout — falling back to GitHub tree");
    loadRepositoryTree();
  }, TIMEOUT_MS);

  socket.on("workspace:snapshot", onSnapshot);
  socket.on("workspace:snapshot-unavailable", onFallback);
  
  // NOW it's safe to request — listeners are attached first
  requestSnapshot(session.sessionId);

  return () => {
    clearTimeout(timer);
    cleanup();
  };
}, [socket, snapshotPending,isHost, session.sessionId, requestSnapshot, loadRepositoryTree]);

// Host: apply restored draft to WebContainer filesystem
useEffect(() => {
  if (!isReady || !webContainerInstance || draftRestoredAt === 0) return;

  const state = useGitWorkspace.getState();
  const { modifiedFiles, createdFiles, openFiles, deletedFiles } = state;

  if (modifiedFiles.size === 0 && createdFiles.size === 0 && deletedFiles.size === 0) return;

  console.log("🔄 [Collab Host] Applying draft to WebContainer...");

  async function applyDraftToWC() {
    for (const path of modifiedFiles) {
      const openFile = openFiles.find(f => f.path === path);
      if (openFile?.content) {
        try {
          await webContainerInstance!.fs.writeFile(`/${path}`, openFile.content, "utf-8");
          console.log(`✅ Applied modified: ${path}`);
        } catch (e) { console.warn(`⚠️ Failed modified: ${path}`, e); }
      }
    }
    for (const path of createdFiles) {
      const openFile = openFiles.find(f => f.path === path);
      const content = openFile?.content ?? "";
      try {
        const dir = path.split("/").slice(0, -1).join("/");
        if (dir) await webContainerInstance!.fs.mkdir(`/${dir}`, { recursive: true });
        await webContainerInstance!.fs.writeFile(`/${path}`, content, "utf-8");
        console.log(`✅ Applied created: ${path}`);
      } catch (e) { console.warn(`⚠️ Failed created: ${path}`, e); }
    }
    for (const path of deletedFiles) {
      try {
        await webContainerInstance!.fs.rm(`/${path}`);
        console.log(`✅ Applied deleted: ${path}`);
      } catch {}
    }
    console.log("✅ [Collab Host] Draft applied to WebContainer");
  }

  applyDraftToWC();
}, [isReady, webContainerInstance, draftRestoredAt]);

// Guest: apply host snapshot to WebContainer filesystem
useEffect(() => {
  if (!isReady || !webContainerInstance || snapshotReceivedAt === 0) return;

  const state = useGitWorkspace.getState();
  const { modifiedFiles, createdFiles, openFiles, deletedFiles } = state;

  console.log("🔄 [Collab Guest] Applying snapshot to WebContainer...");

  async function applySnapshotToWC() {
    for (const path of modifiedFiles) {
      const openFile = openFiles.find(f => f.path === path);
      if (openFile?.content) {
        try {
          await webContainerInstance!.fs.writeFile(`/${path}`, openFile.content, "utf-8");
          console.log(`✅ Applied modified: ${path}`);
        } catch (e) { console.warn(`⚠️ Failed modified: ${path}`, e); }
      }
    }
    for (const path of createdFiles) {
      const openFile = openFiles.find(f => f.path === path);
      const content = openFile?.content ?? "";
      try {
        const dir = path.split("/").slice(0, -1).join("/");
        if (dir) await webContainerInstance!.fs.mkdir(`/${dir}`, { recursive: true });
        await webContainerInstance!.fs.writeFile(`/${path}`, content, "utf-8");
        console.log(`✅ Applied created: ${path}`);
      } catch (e) { console.warn(`⚠️ Failed created: ${path}`, e); }
    }
    for (const path of deletedFiles) {
      try {
        await webContainerInstance!.fs.rm(`/${path}`);
        console.log(`✅ Applied deleted: ${path}`);
      } catch {}
    }
    console.log("✅ [Collab Guest] Snapshot applied to WebContainer");
  }

  applySnapshotToWC();
}, [isReady, webContainerInstance, snapshotReceivedAt]);
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
    broadcastFileDelete(folderToDelete.path, true);

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

  const handleRenameFolder = useCallback(
  async (folderPath: string, newFolderName: string) => {
    const parentDir = folderPath.includes('/')
      ? folderPath.substring(0, folderPath.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${newFolderName}` : newFolderName;

    if (files.some(f => f.path === newPath && f.type === 'dir')) {
      toast.error(`"${newFolderName}" already exists`);
      return;
    }

    // find all files inside old folder
    const folderFiles = files.filter(f => f.path.startsWith(folderPath + '/'));

    // close active file if inside
    if (activeFile?.path.startsWith(folderPath + '/')) {
      closeFile(activeFile.path);
    }

    // update expanded dirs
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.delete(folderPath);
      Array.from(next).forEach(p => {
        if (p.startsWith(folderPath + '/')) {
          next.delete(p);
          next.add(newPath + p.slice(folderPath.length));
        }
      });
      next.add(newPath);
      return next;
    });

    // remove old folder entry, add new
    removeFileFromTree(folderPath);
    addFileToTree({
      name: newFolderName,
      path: newPath,
      sha: "", size: 0, type: "dir", content: "",
    });

    // process each file
    folderFiles.forEach(file => {
      const newFilePath = newPath + file.path.slice(folderPath.length);
      const currentContent = openFiles.find(f => f.path === file.path)?.content
        ?? file.content ?? '';

      removeFileFromTree(file.path);
      if (!file.sha) unmarkFileCreated(file.path);
      else markFileDeleted(file.path);

      addFileToTree({
        name: newFilePath.split('/').pop() || '',
        path: newFilePath,
        sha: "", size: currentContent.length,
        type: file.type, content: currentContent,
      });
      markFileCreated(newFilePath, currentContent);

      // broadcast each file rename
      broadcastFileRename(file.path, newFilePath, currentContent);
    });

    // broadcast folder entry rename
    broadcastFileRename(folderPath, newPath, "", true);

    // WebContainer
    if (webContainerInstance && isReady) {
      try {
        const copyDir = async (src: string, dest: string) => {
          await webContainerInstance.fs.mkdir(dest, { recursive: true });
          const entries = await webContainerInstance.fs.readdir(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = `${src}/${entry.name}`;
            const destPath = `${dest}/${entry.name}`;
            if (entry.isDirectory()) {
              await copyDir(srcPath, destPath);
            } else {
              const content = await webContainerInstance.fs.readFile(srcPath, 'utf-8');
              await webContainerInstance.fs.writeFile(destPath, content, 'utf-8');
            }
          }
        };
        await copyDir(`/${folderPath}`, `/${newPath}`);
        await webContainerInstance.fs.rm(`/${folderPath}`, { recursive: true, force: true });
      } catch (e) {
        console.warn('WC folder rename failed:', e);
      }
    }

    toast.success(`Renamed to ${newFolderName}`, {
      description: "Staged as D + A. Commit via Source Control.",
    });
  },
  [
    files, activeFile, openFiles, closeFile,
    removeFileFromTree, unmarkFileCreated, markFileDeleted,
    addFileToTree, markFileCreated,
    webContainerInstance, isReady,
    broadcastFileRename, setExpandedDirs,
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
            session.branch?? "main",
            result.updatedFiles??[]
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
  const handleDiscardFile = useCallback(async (filePath: string) => {
  const state = useGitWorkspace.getState();

  const wasDeleted = state.deletedFiles.has(filePath);
  const wasCreated = state.createdFiles.has(filePath);
  const originalContent = state.remoteState.get(filePath) ?? "";

  // Update Zustand
  state.discardFileChanges(filePath);
  //if all files in a folder are deleted, remove the folder too
  const parentPath = filePath.includes('/')
    ? filePath.substring(0, filePath.lastIndexOf('/'))
    : '';

  if (parentPath && wasCreated) {
    const remainingFiles = useGitWorkspace.getState().files;
    const folderStillHasCreatedFiles = remainingFiles.some(f =>
      f.path.startsWith(parentPath + '/') && f.path !== filePath
    );

    if (!folderStillHasCreatedFiles) {
      // folder is now empty — remove it
      removeFileFromTree(parentPath);
      if (webContainerInstance && isReady) {
      await webContainerInstance.fs
        .rm(`/${parentPath}`, { recursive: true, force: true })
        .catch(() => {});
    }

    broadcastFileDelete(parentPath, true);
  
    }
  }


  // Sync host WebContainer
  if (webContainerInstance && isReady) {
    if (wasDeleted) {
      const dir = filePath.split("/").slice(0, -1).join("/");
      if (dir) await webContainerInstance.fs.mkdir(`/${dir}`, { recursive: true }).catch(() => {});
      await webContainerInstance.fs.writeFile(`/${filePath}`, originalContent, "utf-8").catch(console.warn);
    } else if (wasCreated) {
      await webContainerInstance.fs.rm(`/${filePath}`).catch(() => {});
    } else {
      await webContainerInstance.fs.writeFile(`/${filePath}`, originalContent, "utf-8").catch(console.warn);
    }
  }

  // Broadcast to guests
  if (wasDeleted) {
    broadcastFileRestore(filePath, originalContent, state.remoteState.get(filePath) ? 
    state.files.find(f => f.path === filePath)?.sha || "" : "");
  } else if (wasCreated) {
    broadcastFileDelete(filePath);
  } else {
    broadcastContentChange(filePath, "", originalContent);
  }

}, [webContainerInstance, isReady, broadcastFileCreate, broadcastFileDelete, broadcastContentChange]);

useEffect(() => {
  if (!webContainerInstance || !isReady) return;
  if (files.length === 0) return; // wait for workspace to initialize

  console.log("🚀 [GitHub FileWatcher] Starting...");

  const handleFileCreated = async (filePath: string, parentPath: string) => {
    if (manuallyCreatedFilesRef.current.has(filePath)) return;

    try {
      const content = await webContainerInstance.fs.readFile(`/${filePath}`, 'utf-8');
      const fileName = filePath.split('/').pop() || '';

      const newFile: GitHubFile = {
        name: fileName,
        path: filePath,
        sha: "",
        size: content.length,
        type: "file",
        content,
      };

      addFileToTree(newFile);
      markFileCreated(filePath, content);

      // expand parent dir in tree
      if (parentPath) {
        setExpandedDirs(prev => new Set([...prev, parentPath]));
      }

      broadcastFileCreate(filePath, content);
      toast.success(`📄 Created ${fileName} via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to add file ${filePath}:`, err);
    }
  };

  const handleFolderCreated = async (folderPath: string, parentPath: string) => {
    if (manuallyCreatedFilesRef.current.has(folderPath)) return;

    try {
      const folderName = folderPath.split('/').pop() || '';
      const gitkeepPath = `${folderPath}/.gitkeep`;

      // use .gitkeep pattern (same as handleCreateFolder in UI)
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

      setExpandedDirs(prev => new Set([
        ...prev,
        ...(parentPath ? [parentPath] : []),
        folderPath,
      ]));

      broadcastFileCreate(gitkeepPath, "");
      toast.success(`📁 Created ${folderName}/ via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to add folder ${folderPath}:`, err);
    }
  };

  const handleFileDeleted = async (filePath: string) => {
    if (manuallyCreatedFilesRef.current.has(filePath)) return;

    try {
      const currentFiles = useGitWorkspace.getState().files;
      const fileInTree = currentFiles.find(f => f.path === filePath);
      if (!fileInTree) return;

      const isLocalOnly = !fileInTree.sha;

      // close if open
      if (useGitWorkspace.getState().activeFilePath === filePath) {
        closeFile(filePath);
      }

      removeFileFromTree(filePath);

      if (isLocalOnly) {
        unmarkFileCreated(filePath);
      } else {
        markFileDeleted(filePath);
      }

      broadcastFileDelete(filePath);
      toast.info(`🗑️ Deleted ${filePath.split('/').pop()} via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to delete file:`, err);
    }
  };

  const handleFolderDeleted = async (folderPath: string) => {
    if (manuallyCreatedFilesRef.current.has(folderPath)) return;

    try {
      const currentFiles = useGitWorkspace.getState().files;

      // find all files under this folder
      const folderFiles = currentFiles.filter(f =>
        f.path.startsWith(folderPath + '/') || f.path === folderPath
      );

      if (folderFiles.length === 0) return;

      // close active file if inside this folder
      const activeFilePath = useGitWorkspace.getState().activeFilePath;
      if (activeFilePath?.startsWith(folderPath + '/')) {
        closeFile(activeFilePath);
      }

      // remove expanded dirs
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(folderPath);
        Array.from(next).forEach(p => {
          if (p.startsWith(folderPath + '/')) next.delete(p);
        });
        return next;
      });

      folderFiles.forEach(file => {
        removeFileFromTree(file.path);
        if (!file.sha) {
          unmarkFileCreated(file.path);
        } else {
          markFileDeleted(file.path);
        }
        broadcastFileDelete(file.path);
      });
      broadcastFileDelete(folderPath, true);

      toast.info(`🗑️ Deleted ${folderPath.split('/').pop()}/ via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to delete folder:`, err);
    }
  };

  const handleFileRenamed = async (oldPath: string, newPath: string) => {
    if (manuallyCreatedFilesRef.current.has(newPath)) return;

    try {
      const currentFiles = useGitWorkspace.getState().files;
      const oldFile = currentFiles.find(f => f.path === oldPath);
      if (!oldFile) return;

      const newName = newPath.split('/').pop() || '';

      // get current content
      const currentOpenFiles = useGitWorkspace.getState().openFiles;
      const currentContent = currentOpenFiles.find(f => f.path === oldPath)?.content
        ?? oldFile.content
        ?? '';
    

      // close old file if open
      if (useGitWorkspace.getState().activeFilePath === oldPath) {
        closeFile(oldPath);
      }

      // remove old
      removeFileFromTree(oldPath);
      if (!oldFile.sha) {
        unmarkFileCreated(oldPath);
      } else {
        markFileDeleted(oldPath);
      }

      // add new
      const newFile: GitHubFile = {
        name: newName,
        path: newPath,
        sha: "",
        size: currentContent.length,
        type: "file",
        content: currentContent,
      };

      addFileToTree(newFile);
      markFileCreated(newPath, currentContent);

      // track new path so next poll doesn't double-fire
      manuallyCreatedFilesRef.current.add(newPath);
      setTimeout(() => manuallyCreatedFilesRef.current.delete(newPath), 3000);

      broadcastFileRename(oldPath, newPath, currentContent);
      toast.info(`✏️ Renamed ${oldPath.split('/').pop()} → ${newName} via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to rename file:`, err);
    }
  };

  const handleFolderRenamed = async (oldPath: string, newPath: string) => {
    if (manuallyCreatedFilesRef.current.has(newPath)) return;

    try {
      const currentFiles = useGitWorkspace.getState().files;
      const folderFiles = currentFiles.filter(f =>
        f.path.startsWith(oldPath + '/')
      );
      //find the old folder entry if it exists
    

      if (folderFiles.length === 0) return;

      // collect nested paths to suppress watcher
      const nestedPaths = folderFiles.map(f =>
        newPath + f.path.slice(oldPath.length)
      );

      manuallyCreatedFilesRef.current.add(newPath);
      nestedPaths.forEach(p => manuallyCreatedFilesRef.current.add(p));

      setTimeout(() => {
        manuallyCreatedFilesRef.current.delete(newPath);
        nestedPaths.forEach(p => manuallyCreatedFilesRef.current.delete(p));
      }, 3000);

      // close active if inside old folder
      const activeFilePath = useGitWorkspace.getState().activeFilePath;
      if (activeFilePath?.startsWith(oldPath + '/')) {
        closeFile(activeFilePath);
      }

      // update expanded dirs
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(oldPath);
        Array.from(next).forEach(p => {
          if (p.startsWith(oldPath + '/')) {
            next.delete(p);
            next.add(newPath + p.slice(oldPath.length));
          }
        });
        next.add(newPath);
        return next;
      });

    removeFileFromTree(oldPath); 
    addFileToTree({
      name: newPath.split('/').pop() || '',
      path: newPath,
      sha: "",
      size: 0,
      type: "dir",
      content: "",
    });

      // process each file in folder
      folderFiles.forEach(file => {
        const newFilePath = newPath + file.path.slice(oldPath.length);
        const currentOpenFiles = useGitWorkspace.getState().openFiles;
        const currentContent = currentOpenFiles.find(f => f.path === file.path)?.content
          ?? file.content
          ?? '';

        // remove old
        removeFileFromTree(file.path);
        if (!file.sha) {
          unmarkFileCreated(file.path);
        } else {
          markFileDeleted(file.path);
        }

        // add new
        const newFile: GitHubFile = {
          name: newFilePath.split('/').pop() || '',
          path: newFilePath,
          sha: "",
          size: currentContent.length,
          type: "file",
          content: currentContent,
        };

        addFileToTree(newFile);
        markFileCreated(newFilePath, currentContent);

        // broadcast each file as rename
        broadcastFileRename(file.path, newFilePath, currentContent);
      });
      broadcastFileRename(oldPath, newPath, "", true);

      toast.info(`✏️ Renamed ${oldPath.split('/').pop()}/ → ${newPath.split('/').pop()}/ via terminal`);
    } catch (err) {
      console.error(`❌ [GitHub FileWatcher] Failed to rename folder:`, err);
    }
  };

  fileCreationWatcher.initialize(
    webContainerInstance,
    handleFileCreated,
    handleFolderCreated,
    ['node_modules', '.git', '.next', 'dist', 'build', '.vercel'],
    {
      onFileDeleted: handleFileDeleted,
      onFolderDeleted: handleFolderDeleted,
      onFileRenamed: handleFileRenamed,
      onFolderRenamed: handleFolderRenamed,
    }
  );

  return () => {
    console.log("🧹 [GitHub FileWatcher] Cleaning up");
    fileCreationWatcher.stop();
  };
}, [
  webContainerInstance,
  isReady,
  isHost,
  files.length,  // re-init when workspace loads
  addFileToTree,
  removeFileFromTree,
  markFileCreated,
  markFileDeleted,
  unmarkFileCreated,
  closeFile,
  broadcastFileCreate,
  broadcastFileDelete,
  broadcastFileRename,
  setExpandedDirs,
]);

 
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
  if (hostNotPresent) {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-4">
      <div className="w-full max-w-md p-8 rounded-lg shadow-sm border text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Users className="h-8 w-8 text-amber-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">Host Not Present</h1>
        <p className="text-muted-foreground">
          The session host hasn't joined yet. The host needs to be present before guests can join.
        </p>
        <p className="text-sm text-muted-foreground">
          Session: <span className="font-mono text-foreground">{session.sessionId}</span>
        </p>
        <Button 
          onClick={() => window.location.reload()}
          className="w-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
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
                  onRenameFolder={handleRenameFolder} 
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
              onDiscardFile={handleDiscardFile}
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
                <CollabEditor
  
  userId={user?.id}
  fileId={activeFile.sha || activeFile.path}
  filePath={activeFile.path}
  initialContent={activeFile.content}
  language={getEditorLanguage(activeFile.path.split(".").pop() || "")}
  onContentChange={handleContentChange}
  remoteCursors={CursorsInCurrentFile}
  onCursorPositionChange={setLocalCursorPosition}
  onEditorReady={(editorInstance) => { editorInstanceRef.current = editorInstance; }}
  isConnected={isConnected}
  emitCursorMove={emitCursorMove}
  emitEditorChange={(payload) => broadcastContentChange(payload.filePath, payload.fileId, payload.content)}
  socket={socket}
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