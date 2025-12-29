"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Users, Clock, AlertCircle, Wifi, WifiOff, FileText, X, Save } from "lucide-react";
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
import { getCollabWorkspaceBySession, updateCollabWorkspace } from "../workspaces/actions";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TemplateFileTree } from "@/modules/playground/components/playgroundExplorer";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { Button } from "@/components/ui/button";
import { generateFileId } from "@/modules/playground/lib/index";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceAutoSave } from "../hooks/useWorkspaceAutoSave";

interface CollabPlaygroundProps {
  session: CollabSessionData;
}

export function CollabPlayground({ session }: CollabPlaygroundProps) {
  const [isJoining, setIsJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 🔥 Use the same Zustand store as main playground
  const {
    templateData,
    setTemplateData,
    setPlaygroundId,
    setOpenFiles,
    setActiveFileId,
    activeFileId,
    closeAllFiles,
    closeFile,
    openFile,
    openFiles,
    handleAddFile,
    handleAddFolder,
    handleDeleteFile,
    handleDeleteFolder,
    handleRenameFile,
    handleRenameFolder,
    updateFileContent,
  } = useFileExplorer();

  // Initialize WebSocket connection
  const { socket, isConnected, participants, emitFileOpen, emitFileChange ,emitFileAction} = useCollabSocket(
    session.sessionId,
    user?.id,
    user?.name
  );
  const {saveWorkSpace} = useWorkspaceAutoSave(session.sessionId,templateData,user?.id,true);

  // 🔥 NEW: Listen for remote editor changes at the parent level
  useEffect(() => {
    if (!socket) return;

     const handleRemoteEditorChange = (payload: {
    userId: string;
    userName: string;
    fileId: string;
    content: string;
    filePath: string;
  }) => {
    if (payload.userId === user?.id) return;

    console.log(`📡 Received remote change from ${payload.userName} for file ${payload.fileId}`);

    const currentTemplate = useFileExplorer.getState().templateData;
    if (currentTemplate) {
      const updatedTemplate = JSON.parse(JSON.stringify(currentTemplate));

      const updateFileInTree = (items: any[]): any[] => {
        return items.map((item) => {
          if ("folderName" in item) {
            return {
              ...item,
              items: updateFileInTree(item.items),
            };
          } else {
            // 🔥 FIX: Generate the ID to match
            const itemId = generateFileId(item, currentTemplate);
            
            if (itemId === payload.fileId) {
              console.log(`✅ Updated ${item.filename}.${item.fileExtension} in template`);
              return { ...item, content: payload.content };
            }
            return item;
          }
        });
      };

      updatedTemplate.items = updateFileInTree(updatedTemplate.items);
      setTemplateData(updatedTemplate);
    }

      // 🔥 Update open files (if the file is open)
      const currentOpenFiles = useFileExplorer.getState().openFiles;
      if (Array.isArray(currentOpenFiles)) {
        const fileIsOpen = currentOpenFiles.some((f) => f.id === payload.fileId);
        
        if (fileIsOpen) {
          console.log(`📝 Updating open file: ${payload.fileId}`);
          const updatedOpenFiles = currentOpenFiles.map((file) => {
            if (file.id === payload.fileId) {
              // Only update if it's not the active file being edited
              // (active file updates are handled by CollabEditor)
              if (file.id !== activeFileId) {
                return {
                  ...file,
                  content: payload.content,
                  originalContent: payload.content,
                  hasUnsavedChanges: false,
                };
              }
            }
            return file;
          });
          setOpenFiles(updatedOpenFiles);
        }
      }
    };

    socket.on("editor:change", handleRemoteEditorChange);

    return () => {
      socket.off("editor:change", handleRemoteEditorChange);
    };
  }, [socket, user?.id, setTemplateData, setOpenFiles, activeFileId]);

  useEffect(() => {
    if (!socket) return;

    const handleRemoteFileAction = async (payload: {
      userId: string;
      userName: string;
      action: "create" | "delete" | "rename";
      filePath: string;
      newPath?: string;
      content?: string;
      isFolder?: boolean;
    }) => {
      // Skip if it's from current user
      if (payload.userId === user?.id) return;

      console.log(`🔧 Received file action from ${payload.userName}:`, payload.action, payload.filePath);

      // Reload the workspace from database to get the latest state
      try {
        const workspace = await getCollabWorkspaceBySession(session.sessionId);
        if (workspace && workspace.templateData) {
          const enrichedTemplate = enrichTemplateWithPaths(workspace.templateData);
          setTemplateData(enrichedTemplate);

          // Show notification to user
          const fileName = payload.filePath.split('/').pop();
          switch (payload.action) {
            case "create":
              toast.info(`${payload.userName} ${payload.isFolder ? 'created folder' : 'created file'}: ${fileName}`);
              break;
            case "delete":
              toast.info(`${payload.userName} ${payload.isFolder ? 'deleted folder' : 'deleted file'}: ${fileName}`);
              
              // 🔥 Close the file if it's currently open
              const currentOpenFiles = useFileExplorer.getState().openFiles;
              const fileToClose = currentOpenFiles.find((f) => 
                `${f.path}/${f.filename}.${f.fileExtension}`.replace(/^\//, '') === payload.filePath
              );
              if (fileToClose) {
                closeFile(fileToClose.id);
              }
              break;
            case "rename":
              toast.info(`${payload.userName} renamed: ${fileName} → ${payload.newPath?.split('/').pop()}`);
              break;
          }

          console.log("✅ Template reloaded after file operation");
        }
      } catch (error) {
        console.error("❌ Error reloading workspace after file action:", error);
      }
    };

    socket.on("file:action", handleRemoteFileAction);

    return () => {
      socket.off("file:action", handleRemoteFileAction);
    };
  }, [socket, user?.id, session.sessionId, setTemplateData, closeFile]);

  // 🔥 Save function similar to main playground
  const saveCollabWorkspace = useCallback(
    async (updatedTemplate: TemplateFolder) => {
      try {
        setIsSaving(true);
        const result = await updateCollabWorkspace({
          sessionId: session.sessionId,
          templateData: updatedTemplate,
          userId: user?.id,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to save");
        }

        console.log("✅ Collab workspace saved");
        return updatedTemplate;
      } catch (error) {
        console.error("❌ Save error:", error);
        toast.error("Failed to save changes");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [session.sessionId, user?.id]
  );

  // 🔥 Wrapped handlers (same pattern as main playground)
  const wrappedHandleAddFile = useCallback(
    async (newFile: TemplateFile, parentPath: string) => {
      const result = await handleAddFile(
        newFile,
        parentPath,
        async () => {},
        null,
        saveCollabWorkspace
      );

      // 🔥 Emit file creation to other participants
      const filePath = parentPath
        ? `${parentPath}/${newFile.filename}.${newFile.fileExtension}`
        : `${newFile.filename}.${newFile.fileExtension}`;
      
      emitFileAction({
        action: "create",
        filePath,
        content: newFile.content || "",
      });

      console.log(`📤 Emitted file creation: ${filePath}`);
      
      return result;
    },
    [handleAddFile, saveCollabWorkspace, emitFileAction]
  );
  
  const wrappedHandleAddFolder = useCallback(
    async (newFolder: TemplateFolder, parentPath: string) => {
      const result = await handleAddFolder(
        newFolder,
        parentPath,
        null,
        saveCollabWorkspace
      );

      // 🔥 Emit folder creation to other participants
      const folderPath = parentPath
        ? `${parentPath}/${newFolder.folderName}`
        : newFolder.folderName;
      
      emitFileAction({
        action: "create",
        filePath: folderPath,
        content: "",
      });

      console.log(`📤 Emitted folder creation: ${folderPath}`);
      
      return result;
    },
    [handleAddFolder, saveCollabWorkspace, emitFileAction]
  );
   const wrappedHandleDeleteFile = useCallback(
    async (file: TemplateFile, parentPath: string) => {
      const result = await handleDeleteFile(file, parentPath, saveCollabWorkspace);
      
      // 🔥 Emit file deletion to other participants
      const filePath = parentPath
        ? `${parentPath}/${file.filename}.${file.fileExtension}`
        : `${file.filename}.${file.fileExtension}`;
      
      emitFileAction({
        action: "delete",
        filePath,
      });

      console.log(`📤 Emitted file deletion: ${filePath}`);
      
      return result;
    },
    [handleDeleteFile, saveCollabWorkspace, emitFileAction]
  );

  const wrappedHandleDeleteFolder = useCallback(
    async (folder: TemplateFolder, parentPath: string) => {
      const result = await handleDeleteFolder(folder, parentPath, saveCollabWorkspace);

      // 🔥 Emit folder deletion to other participants
      const folderPath = parentPath
        ? `${parentPath}/${folder.folderName}`
        : folder.folderName;
      
      emitFileAction({
        action: "delete",
        filePath: folderPath,
      });

      console.log(`📤 Emitted folder deletion: ${folderPath}`);
      
      return result;
    },
    [handleDeleteFolder, saveCollabWorkspace, emitFileAction]
  );


  const wrappedHandleRenameFile = useCallback(
    async (
      file: TemplateFile,
      newFilename: string,
      newExtension: string,
      parentPath: string
    ) => {
      const oldPath = parentPath
        ? `${parentPath}/${file.filename}.${file.fileExtension}`
        : `${file.filename}.${file.fileExtension}`;
      
      const newPath = parentPath
        ? `${parentPath}/${newFilename}.${newExtension}`
        : `${newFilename}.${newExtension}`;

      const result = await handleRenameFile(
        file,
        newFilename,
        newExtension,
        parentPath,
        saveCollabWorkspace
      );

      // 🔥 Emit file rename to other participants
      emitFileAction({
        action: "rename",
        filePath: oldPath,
        newPath: newPath,
      });

      console.log(`📤 Emitted file rename: ${oldPath} → ${newPath}`);
      
      return result;
    },
    [handleRenameFile, saveCollabWorkspace, emitFileAction]
  );


  const wrappedHandleRenameFolder = useCallback(
    async (folder: TemplateFolder, newFolderName: string, parentPath: string) => {
      const oldPath = parentPath
        ? `${parentPath}/${folder.folderName}`
        : folder.folderName;
      
      const newPath = parentPath
        ? `${parentPath}/${newFolderName}`
        : newFolderName;

      const result = await handleRenameFolder(
        folder,
        newFolderName,
        parentPath,
        saveCollabWorkspace
      );

      // 🔥 Emit folder rename to other participants
      emitFileAction({
        action: "rename",
        filePath: oldPath,
        newPath: newPath,
      });

      console.log(`📤 Emitted folder rename: ${oldPath} → ${newPath}`);
      
      return result;
    },
    [handleRenameFolder, saveCollabWorkspace, emitFileAction]
  );




  // 🔥 File selection handler
  const handleFileSelect = useCallback(
    (file: TemplateFile & { path?: string }) => {
      console.log("📄 File selected:", file);

      openFile(file);

      const filePath = `${file.path || ""}/${file.filename}.${file.fileExtension}`.replace(
        /^\//, ""
      );
      emitFileOpen(file.id, filePath);
    },
    [openFile, emitFileOpen]
  );

  // 🔥 Content change handler - Now syncs with socket
  const handleFileContentChange = useCallback(
    (fileId: string, newContent: string) => {
      console.log("✏️ Content changed for file:", fileId);

      // Update local Zustand state
      updateFileContent(fileId, newContent);

      // 🔥 CRITICAL: Also update the template data immediately
      const currentTemplate = useFileExplorer.getState().templateData;
      if (currentTemplate) {
        const updatedTemplate = JSON.parse(JSON.stringify(currentTemplate));

        const updateFileInTree = (items: any[]): any[] => {
          return items.map((item) => {
            if ("folderName" in item) {
              return {
                ...item,
                items: updateFileInTree(item.items),
              };
            } else {
              const itemid = generateFileId(item,currentTemplate)
              if (itemid === fileId) {
                return { ...item, content: newContent };
              }
              return item;
            }
          });
        };

        updatedTemplate.items = updateFileInTree(updatedTemplate.items);
        setTemplateData(updatedTemplate);
      }

      // Note: Socket emission is handled by CollabEditor's emitEditorChange
    },
    [updateFileContent, setTemplateData]
  );

  // 🔥 Save current file
  const handleSave = useCallback(async () => {
    if (!activeFileId || !templateData) {
      toast.error("No active file to save");
      return;
    }

    const fileToSave = openFiles.find((f) => f.id === activeFileId);
    if (!fileToSave || !fileToSave.hasUnsavedChanges) {
      toast.info("No changes to save");
      return;
    }

    try {
      setIsSaving(true);

      // Template data should already be updated from handleFileContentChange
      // Just save it to database
      const result = await saveCollabWorkspace(templateData);
      if (!result) {
        throw new Error("Failed to save");
      }

      // Mark as saved in open files
      const updatedOpenFiles = openFiles.map((f) =>
        f.id === activeFileId
          ? {
              ...f,
              originalContent: f.content,
              hasUnsavedChanges: false,
            }
          : f
      );
      setOpenFiles(updatedOpenFiles);

      toast.success(`Saved ${fileToSave.filename}.${fileToSave.fileExtension}`);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save file");
    } finally {
      setIsSaving(false);
    }
  }, [
    activeFileId,
    templateData,
    openFiles,
    saveCollabWorkspace,
    setOpenFiles,
  ]);

  // 🔥 Save all files
  const handleSaveAll = useCallback(async () => {
    const unsavedFiles = openFiles.filter((f) => f.hasUnsavedChanges);
    if (unsavedFiles.length === 0) {
      toast.info("No unsaved changes");
      return;
    }

    try {
      setIsSaving(true);
      
      if (!templateData) return;

      // Template data should already be updated from handleFileContentChange
      // Just save it to database
      const result = await saveCollabWorkspace(templateData);
      if (!result) throw new Error("Failed to save");

      // Mark all as saved
      const updatedOpenFiles = openFiles.map((f) => ({
        ...f,
        originalContent: f.content,
        hasUnsavedChanges: false,
      }));
      setOpenFiles(updatedOpenFiles);

      toast.success(`Saved ${unsavedFiles.length} files`);
    } catch (error) {
      console.error("Save all error:", error);
      toast.error("Failed to save files");
    } finally {
      setIsSaving(false);
    }
  }, [openFiles, templateData, saveCollabWorkspace, setOpenFiles]);

  // 🔥 Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAll();
        } else {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleSaveAll]);

  // 🔥 Initialize
  useEffect(() => {
    let mounted = true;

    const join = async () => {
      try {
        console.log("🚀 Starting join process for session:", session.sessionId);

        const currentUserData = await currentUser();
        if (!mounted) return;
        setUser(
          currentUserData ? { id: currentUserData.id!, name: currentUserData.name! } : null
        );

        const result = await joinCollabSession(session.sessionId);
        if (!mounted) return;

        if (!result.success) {
          setJoinError(result.error || "Failed to join session");
          toast.error(result.error);
          setIsJoining(false);
          return;
        }

        const workspace = await getCollabWorkspaceBySession(session.sessionId);
        if (!mounted) return;

        if (!workspace || !workspace.templateData) {
          console.error("❌ No workspace/template found");
          toast.error("No template data found");
          setIsJoining(false);
          return;
        }

        const enrichedTemplate = enrichTemplateWithPaths(workspace.templateData);
        console.log("✅ Enriched template with", enrichedTemplate.items.length, "items");

        setPlaygroundId(session.sessionId);
        setTemplateData(enrichedTemplate);

        const firstFile = findFirstFile(enrichedTemplate);
        if (firstFile && mounted) {
          console.log("📄 Auto-opening first file:", firstFile.filename);
          setTimeout(() => {
            if (mounted) {
              handleFileSelect(firstFile);
            }
          }, 100);
        }

        if (mounted) {
          toast.success("Successfully joined collaboration session!");
        }
      } catch (error) {
        console.error("❌ Error joining session:", error);
        if (mounted) {
          setJoinError("An error occurred while joining");
          toast.error("Failed to join session");
        }
      } finally {
        if (mounted) {
          setIsJoining(false);
        }
      }
    };

    join();

    return () => {
      mounted = false;
      closeAllFiles();
      setTemplateData(null);
    };
  }, [session.sessionId, setPlaygroundId, setTemplateData, closeAllFiles]);

  const findFirstFile = (
    folder: TemplateFolder
  ): (TemplateFile & { path?: string }) | null => {
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

  if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Joining Collaboration Session
          </h2>
          <div className="mb-8">
            <LoadingStep currentStep={1} step={1} label="Connecting to session" />
            <LoadingStep currentStep={2} step={2} label="Loading template" />
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
  const now = new Date();
  const hoursRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  const activeFile = Array.isArray(openFiles) ? openFiles.find((f) => f.id === activeFileId) : undefined;
  const hasUnsavedChanges = Array.isArray(openFiles) ? openFiles.some((f) => f.hasUnsavedChanges) : false;

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
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background">
          {templateData && (
            <TemplateFileTree
              data={templateData}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile}
              title="Files (Collab)"
              onAddFile={wrappedHandleAddFile}
              onAddFolder={wrappedHandleAddFolder}
              onDeleteFile={wrappedHandleDeleteFile}
              onDeleteFolder={wrappedHandleDeleteFolder}
              onRenameFile={wrappedHandleRenameFile}
              onRenameFolder={wrappedHandleRenameFolder}
            />
          )}

          <div className="flex flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
              <div className="flex flex-1 items-center gap-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <h1 className="font-semibold">Collaboration Session</h1>
                    <p className="text-xs text-muted-foreground">
                      {openFiles.length} file{openFiles.length !== 1 ? "s" : ""} open
                      {hasUnsavedChanges && " • Unsaved changes"}
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSave}
                        disabled={!activeFile?.hasUnsavedChanges || isSaving}
                        aria-label="Save current file"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save (Ctrl+S)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveAll}
                        disabled={!hasUnsavedChanges || isSaving}
                        aria-label="Save all files"
                      >
                        <Save className="h-4 w-4" />
                        <span className="ml-1 text-xs">All</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save All (Ctrl+Shift+S)</TooltipContent>
                  </Tooltip>

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
                    <span className="text-sm">Expires in {hoursRemaining}h</span>
                  </div>
                </div>
              </div>
            </header>

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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {openFiles.length > 0 && (
              <div className="border-b border-border bg-muted/30">
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {openFiles.map((file) => {
                      const isDuplicate = openFiles.some(
                        (f) =>
                          f.filename === file.filename &&
                          f.fileExtension === file.fileExtension &&
                          f.id !== file.id
                      );
                      const displayName =
                        isDuplicate && file.path
                          ? `${file.path}/${file.filename}.${file.fileExtension}`
                          : `${file.filename}.${file.fileExtension}`;

                      return (
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
                          <span className="text-sm" title={displayName}>
                            {displayName}
                          </span>
                          {file.hasUnsavedChanges && (
                            <span className="h-2 w-2 rounded-full bg-orange-500" />
                          )}
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
                      );
                    })}
                  </div>
                  {openFiles.length > 1 && (
                    <button
                      onClick={closeAllFiles}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Close All
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              {activeFile ? (
                <CollabEditor
                  sessionId={session.sessionId}
                  userId={user?.id}
                  userName={user?.name || "Anonymous"}
                  fileId={activeFile.id}
                  filePath={`${activeFile.path || ""}/${activeFile.filename}.${
                    activeFile.fileExtension
                  }`.replace(/^\//, "")}
                  initialContent={
                    typeof activeFile.content === "string" ? activeFile.content : ""
                  }
                  language={getLanguage(activeFile.fileExtension || "")}
                  onContentChange={(content) =>
                    handleFileContentChange(activeFile.id, content)
                  }
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  {templateData
                    ? "No files open. Select a file from the sidebar."
                    : "Loading template..."}
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}