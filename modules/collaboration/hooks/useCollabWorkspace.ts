import { useCallback, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { useGitWorkspace } from "@/modules/github/hooks/Usegitworkspace";

export interface EditorChangePayload {
  sessionId: string;
  userId?: string;
  userName?: string;
  fileId: string;   // sha — used as stable file identifier
  filePath: string;
  content: string;
  changes: any;
  timestamp: number;
}

export interface FileActionPayload {
  sessionId: string;
  userId?: string;
  userName?: string;
  /** "create" | "delete" | "rename" */
  action: "create" | "delete" | "rename";
  filePath: string;
  newPath?: string;   // only for rename
  content?: string;   // only for create
}

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
}

interface UseCollabWorkspaceProps {
  socket: Socket | null;
  sessionId: string;
  currentUserId?: string;
  /** WebContainer instance — passed through but not used in Phase 1 */
  webContainerInstance?: any | null;
}

export function useCollabWorkspace({
  socket,
  sessionId,
  currentUserId,
  webContainerInstance,
}: UseCollabWorkspaceProps){
    const updateFileContent  = useGitWorkspace((s) => s.updateFileContent);
  const addFileToTree      = useGitWorkspace((s) => s.addFileToTree);
  const markFileCreated    = useGitWorkspace((s) => s.markFileCreated);
  const removeFileFromTree = useGitWorkspace((s) => s.removeFileFromTree);
  const markFileDeleted    = useGitWorkspace((s) => s.markFileDeleted);
  const unmarkFileCreated  = useGitWorkspace((s) => s.unmarkFileCreated);
  const openFileInWorkspace = useGitWorkspace((s) => s.openFile);
  const openFiles          = useGitWorkspace((s) => s.openFiles);
  const files              = useGitWorkspace((s) => s.files);
  const openFilesRef = useRef(openFiles);
  const filesRef     = useRef(files);
  useEffect(() => { openFilesRef.current = openFiles; }, [openFiles]);
  useEffect(() => { filesRef.current = files; }, [files]);

  const handleRemoteEditorChange = useCallback(
    (payload: EditorChangePayload) => {
      // Ignore own echoes
      if (payload.userId === currentUserId) return;

      console.log(
        `[CollabWorkspace] ✏️ Remote edit on ${payload.filePath} from ${payload.userName}`
      );
      const isAlreadyOpen = openFilesRef.current.some(
        (f) => f.path === payload.filePath
      );

      if (!isAlreadyOpen) {
        // File exists in the tree but hasn't been opened as a tab yet.
        // We must add it to openFiles before updateFileContent can touch it.
        const treeFile = filesRef.current.find(
          (f) => f.path === payload.filePath
        );
        if (treeFile) {
          // openFile seeds openFiles with the original remote content,
          // then updateFileContent below overwrites it with the new content.
          openFileInWorkspace(treeFile);
        }
      }

      // updateFileContent drives both the open-file tab content and the
      // modifiedFiles set — same path as the single-user playground.
      updateFileContent(payload.filePath, payload.content);
    },
    [currentUserId, updateFileContent, openFileInWorkspace]
  );
    const handleRemoteFileAction = useCallback(
    (payload: FileActionPayload) => {
      if (payload.userId === currentUserId) return;

      console.log(
        `[CollabWorkspace] 📁 Remote file:action "${payload.action}" on ${payload.filePath} from ${payload.userName}`
      );

      switch (payload.action) {
        // ── CREATE ────────────────────────────────────────────────────────
        case "create": {
          const alreadyExists = filesRef.current.some(
            (f) => f.path === payload.filePath
          );
          if (alreadyExists) {
            console.warn(
              `[CollabWorkspace] ⚠️ File already exists locally, skipping create: ${payload.filePath}`
            );
            return;
          }

          const newFile: GitHubFile = {
            name: payload.filePath.split("/").pop() || payload.filePath,
            path: payload.filePath,
            sha: "",        // not on GitHub yet
            size: (payload.content ?? "").length,
            type: "file",
            content: payload.content ?? "",
          };

          addFileToTree(newFile);
          // Pass content so the draft is correct if the file is opened
          markFileCreated(payload.filePath, payload.content ?? "");
          break;
        }

        // ── DELETE ────────────────────────────────────────────────────────
        case "delete": {
          const target = filesRef.current.find(
            (f) => f.path === payload.filePath
          );

          removeFileFromTree(payload.filePath);

          if (!target?.sha) {
            // Local-only file — just untrack
            unmarkFileCreated(payload.filePath);
          } else {
            // GitHub file — stage for deletion
            markFileDeleted(payload.filePath);
          }
          break;
        }

        // ── RENAME ────────────────────────────────────────────────────────
        case "rename": {
          if (!payload.newPath) {
            console.warn("[CollabWorkspace] ⚠️ rename action missing newPath");
            return;
          }

          const oldFile = filesRef.current.find(
            (f) => f.path === payload.filePath
          );

          // --- Delete-side ---
          removeFileFromTree(payload.filePath);
          if (!oldFile?.sha) {
            unmarkFileCreated(payload.filePath);
          } else {
            markFileDeleted(payload.filePath);
          }

          // --- Add-side ---
          const currentContent =
            openFilesRef.current.find((f) => f.path === payload.filePath)
              ?.content ??
            oldFile?.content ??
            payload.content ??
            "";

          const renamedFile: GitHubFile = {
            name: payload.newPath.split("/").pop() || payload.newPath,
            path: payload.newPath,
            sha: "",
            size: currentContent.length,
            type: "file",
            content: currentContent,
          };

          addFileToTree(renamedFile);
          markFileCreated(payload.newPath, currentContent);
          break;
        }

        default:
          console.warn(
            `[CollabWorkspace] ⚠️ Unknown file:action: ${(payload as any).action}`
          );
      }
    },
    [
      currentUserId,
      addFileToTree,
      markFileCreated,
      removeFileFromTree,
      markFileDeleted,
      unmarkFileCreated,
    ]
  );


  useEffect(() => {
    if (!socket) return;

    console.log("[CollabWorkspace] 🔌 Attaching workspace socket listeners");

    socket.on("editor:change", handleRemoteEditorChange);
    socket.on("file:action",   handleRemoteFileAction);

    return () => {
      socket.off("editor:change", handleRemoteEditorChange);
      socket.off("file:action",   handleRemoteFileAction);
      console.log("[CollabWorkspace] 🧹 Removed workspace socket listeners");
    };
  }, [socket, handleRemoteEditorChange, handleRemoteFileAction]);

  const broadcastContentChange = useCallback(
    (filePath: string, sha: string, content: string) => {
      if (!socket?.connected) return;

      const payload: EditorChangePayload = {
        sessionId,
        userId:    currentUserId,
        fileId:    sha || filePath,   // fall back to path when sha is empty
        filePath,
        content,
        changes:   [],                // Phase 1: full-content sync, no deltas
        timestamp: Date.now(),
      };

      socket.emit("editor:change", payload);
    },
    [socket, sessionId, currentUserId]
  );
  const broadcastFileCreate = useCallback(
    (filePath: string, content: string) => {
      if (!socket?.connected) return;

      const payload: FileActionPayload = {
        sessionId,
        userId:   currentUserId,
        action:   "create",
        filePath,
        content,
      };

      socket.emit("file:action", payload);
    },
    [socket, sessionId, currentUserId]
  );

  /**
   * Emit a file:action "delete" event to peers.
   */
  const broadcastFileDelete = useCallback(
    (filePath: string) => {
      if (!socket?.connected) return;

      const payload: FileActionPayload = {
        sessionId,
        userId:   currentUserId,
        action:   "delete",
        filePath,
      };

      socket.emit("file:action", payload);
    },
    [socket, sessionId, currentUserId]
  );

  /**
   * Emit a file:action "rename" event to peers.
   */
  const broadcastFileRename = useCallback(
    (oldPath: string, newPath: string, content: string) => {
      if (!socket?.connected) return;

      const payload: FileActionPayload = {
        sessionId,
        userId:   currentUserId,
        action:   "rename",
        filePath: oldPath,
        newPath,
        content,
      };

      socket.emit("file:action", payload);
    },
    [socket, sessionId, currentUserId]
  );

  return {
    broadcastContentChange,
    broadcastFileCreate,
    broadcastFileDelete,
    broadcastFileRename,
  };


}