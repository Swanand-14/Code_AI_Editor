"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Save, Bot, Settings, FileText, X, AlertCircle } from "lucide-react";

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { usePlayground } from "@/modules/playground/hooks/usePlayground";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { TemplateFileTree } from "@/modules/playground/components/playgroundExplorer";
import { TemplateFile } from "@prisma/client";
import { Separator } from "@/components/ui/separator";
import PlaygroundEditor from "@/modules/playground/components/playgroundEditor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useWebContainer } from "@/modules/webContainers/hooks/useWebContainer";
import { WebContainerPreview } from "@/modules/webContainers/components/WebContainerPreview";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { LoadingStep } from "@/modules/playground/components/loader";
import { findFilePath } from "@/modules/playground/lib";
import ToggleAI from "@/modules/playground/components/toggle-ai"
import { toast } from "sonner";
import { UseAiSuggestions } from "@/modules/playground/hooks/useAiSuggestions";

function MainPlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);
  const AiSuggestions = UseAiSuggestions();
  const {
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

  const {
    severUrl,
    isLoading: webContainerLoading,
    error: webContainerError,
    instance: webContainerInstance,
    writeFileSync,
    destroy,
  } = useWebContainer({ templateData });

  const lastSyncedContent = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setPlaygroundId(id);
  }, [id, setPlaygroundId]);

  useEffect(() => {
    if (templateData && !openFiles.length) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  const wrappedHandleAddFile = useCallback(
    (newFile: TemplateFile, parentPath: string) => {
      return handleAddFile(
        newFile,
        parentPath,
        writeFileSync!,
        webContainerInstance,
        saveTemplateData
      );
    },
    [handleAddFile, writeFileSync, webContainerInstance, saveTemplateData]
  );

  const wrappedHandleAddFolder = useCallback(
    (newFolder: TemplateFolder, parentPath: string) => {
      return handleAddFolder(
        newFolder,
        parentPath,
        webContainerInstance,
        saveTemplateData
      );
    },
    [handleAddFolder, webContainerInstance, saveTemplateData]
  );

  const wrappedHandleDeleteFile = useCallback(
    (file: TemplateFile, parentPath: string) => {
      return handleDeleteFile(file, parentPath, saveTemplateData);
    },
    [handleDeleteFile, saveTemplateData]
  );

  const wrappedHandleDeleteFolder = useCallback(
    (folder: TemplateFolder, parentPath: string) => {
      return handleDeleteFolder(folder, parentPath, saveTemplateData);
    },
    [handleDeleteFolder, saveTemplateData]
  );

  const wrappedHandleRenameFile = useCallback(
    (
      file: TemplateFile,
      newFilename: string,
      newExtension: string,
      parentPath: string
    ) => {
      return handleRenameFile(
        file,
        newFilename,
        newExtension,
        parentPath,
        saveTemplateData
      );
    },
    [handleRenameFile, saveTemplateData]
  );

  const wrappedHandleRenameFolder = useCallback(
    (folder: TemplateFolder, newFolderName: string, parentPath: string) => {
      return handleRenameFolder(
        folder,
        newFolderName,
        parentPath,
        saveTemplateData
      );
    },
    [handleRenameFolder, saveTemplateData]
  );

  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const hasUnsavedChanges = openFiles.some((file) => file.hasUnsavedChanges);

  const handleFileSelect = (file: TemplateFile) => openFile(file);

  const handleSave = useCallback(
    async (fileId?: string) => {
      const targetFile = fileId || activeFileId;
      if (!targetFile) return;

      const fileToSave = openFiles.find((file) => file.id === targetFile);
      if (!fileToSave || !fileToSave.hasUnsavedChanges) return;

      const latestTemplateData = useFileExplorer.getState().templateData;
      if (!latestTemplateData) return;

      try {
        const filePath = findFilePath(fileToSave, latestTemplateData);
        if (!filePath) {
          toast.error("File path not found");
          return;
        }

        const updatedTemplateData = JSON.parse(
          JSON.stringify(latestTemplateData)
        );

        const updateFileContentRecursive = (items: any[]) =>
          items.map((item) => {
            if ("folderName" in item) {
              return {
                ...item,
                items: updateFileContentRecursive(item.items),
              };
            } else if (
              item.filename === fileToSave.filename &&
              item.fileExtension === fileToSave.fileExtension
            ) {
              return { ...item, content: fileToSave.content };
            }
            return item;
          });

        if (writeFileSync) {
          await writeFileSync(filePath, fileToSave.content);
          lastSyncedContent.current.set(fileToSave.id, fileToSave.content);

          if (webContainerInstance && webContainerInstance.fs) {
            await webContainerInstance.fs.writeFile(
              filePath,
              fileToSave.content
            );
          }
        }

        const newTemplateData = await saveTemplateData(updatedTemplateData);
        setTemplateData(newTemplateData || updatedTemplateData);

        const updatedOpenFiles = openFiles.map((f) =>
          f.id === targetFile
            ? {
                ...f,
                content: fileToSave.content,
                originalContent: fileToSave.content,
                hasUnsavedChanges: false,
              }
            : f
        );
        setOpenFiles(updatedOpenFiles);

        toast.success(
          `Saved ${fileToSave.filename}.${fileToSave.fileExtension}`
        );
      } catch (error) {
        toast.error("Failed to save file");
        console.error("Save error:", error);
      }
    },
    [
      activeFileId,
      openFiles,
      saveTemplateData,
      writeFileSync,
      webContainerInstance,
      setTemplateData,
      setOpenFiles,
    ]
  );

  const handleSaveAll = async () => {
    const unsavedFiles = openFiles.filter((item) => item.hasUnsavedChanges);
    if (unsavedFiles.length === 0) {
      toast.info("No unsaved changes");
      return;
    }

    try {
      await Promise.all(unsavedFiles.map((f) => handleSave(f.id)));
      toast.success(`Saved ${unsavedFiles.length} files`);
    } catch (error) {
      toast.error("Failed to save some files");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const handleAIAssistant = () => {};

  const handleContentChange = useCallback(
    (value: string) => {
      if (activeFile) {
        updateFileContent(activeFile.id, value);
      }
    },
    [activeFile, updateFileContent]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="destructive">
          Try Again
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Loading Playground
          </h2>
          <div className="mb-8">
            <LoadingStep
              currentStep={1}
              step={1}
              label="Loading playground data"
            />
            <LoadingStep
              currentStep={2}
              step={2}
              label="Setting up environment"
            />
            <LoadingStep currentStep={3} step={3} label="Ready to code" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-background">
        
        <TemplateFileTree
        /* ts-ignore */
          data={templateData!}
          onFileSelect={handleFileSelect}
          selectedFile={activeFile}
          title="File Explorer"
          onAddFile={wrappedHandleAddFile}
          onAddFolder={wrappedHandleAddFolder}
          onDeleteFile={wrappedHandleDeleteFile}
          onDeleteFolder={wrappedHandleDeleteFolder}
          onRenameFile={wrappedHandleRenameFile}
          onRenameFolder={wrappedHandleRenameFolder}
        />

        <SidebarInset className="flex flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />

            <div className="flex flex-1 items-center gap-4">
              <div className="flex flex-1 flex-col">
                <h1 className="font-semibold text-foreground">
                  {playgroundData?.name || "Untitled Playground"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {openFiles.length} file{openFiles.length !== 1 ? "s" : ""}{" "}
                  open
                  {hasUnsavedChanges && " • Unsaved changes"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSave()}
                      disabled={!activeFile?.hasUnsavedChanges}
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
                      disabled={!hasUnsavedChanges}
                      aria-label="Save all files"
                    >
                      <Save className="h-4 w-4" />
                      <span className="ml-1 text-xs">All</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save All (Ctrl+Shift+S)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleAI isEnabled={AiSuggestions.isEnabled}
                    onToggle={AiSuggestions.toggleEnabled}
                    suggestionLoading={AiSuggestions.isLoading}
                    />
                  </TooltipTrigger>
                  <TooltipContent>AI Assistant</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                    >
                      {isPreviewVisible ? "Hide" : "Show"} Preview
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={closeAllFiles}>
                      Close All Files
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

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
                  ))}
                </div>
                {openFiles.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={closeAllFiles}
                    className="h-6 px-2 text-xs"
                  >
                    Close All
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Editor Area */}
          <div className="flex-1 overflow-hidden">
            {openFiles.length > 0 ? (
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={isPreviewVisible ? 50 : 100}>
                  <div className="h-full w-full">
                    {/* <PlaygroundEditor
                      activeFile={activeFile}
                      content={activeFile?.content || ""}
                      onContentChange={(value)=>activeFileId&&updateFileContent(activeFileId, value)}
                      suggestions={AiSuggestions.suggestions}
                      suggestionLoading = {AiSuggestions.isLoading}
                      suggestionPosition = {AiSuggestions.position}
                      onAcceptSuggestion = {(editor,monaco)=>AiSuggestions.acceptSuggestion(editor,monaco)}
                      onRejectSuggestion = {(editor)=>AiSuggestions.rejectSuggestion(editor)}
                      onTriggerSuggestion = {(type,editor)=>AiSuggestions.fetchSuggestion(type,editor)}

                    /> */}
                    <PlaygroundEditor
  activeFile={activeFile}
  content={activeFile?.content || ""}
  onContentChange={(value) => activeFileId && updateFileContent(activeFileId, value)}
  suggestionLoading={false}
/>
                  </div>
                </ResizablePanel>

                {isPreviewVisible && templateData && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={50}>
                      <WebContainerPreview
                        templateData={templateData}
                        serverUrl={severUrl || ""}
                        isLoading={webContainerLoading}
                        error={webContainerError}
                        instance={webContainerInstance}
                        writeFileSync={writeFileSync}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No files open. Select a file from the sidebar.
              </div>
            )}
          </div>
        </SidebarInset>
      </div>
    </TooltipProvider>
  );
}

export default MainPlaygroundPage;