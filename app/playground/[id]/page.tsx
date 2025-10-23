"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save, Bot, Settings, FileText, X } from "lucide-react";

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
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { useWebContainer } from "@/modules/webContainers/hooks/useWebContainer";
import {WebContainerPreview} from "@/modules/webContainers/components/WebContainerPreview";

function MainPlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);

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
  } = useFileExplorer();

  const {
    severUrl,
    isLoading: webContainerLoading,
    error: webContainerError,
    instance: webContainerInstance,
    writeFileSync,
    destroy
  } = useWebContainer({ templateData });

  useEffect(() => {
    setPlaygroundId(id);
  }, [id, setPlaygroundId]);

  useEffect(() => {
    if (templateData && !openFiles.length) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const hasUnsavedChanges = openFiles.some((file) => file.hasUnsavedChanges);

  const handleFileSelect = (file: TemplateFile) => openFile(file);
  const handleSaveFile = () => {};
  const handleSaveAll = () => {};
  const handleAIAssistant = () => {};

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-background">
        <TemplateFileTree
          data={templateData!}
          onFileSelect={handleFileSelect}
          selectedFile={activeFile}
          title="File Explorer"
          onAddFile={() => {}}
          onAddFolder={() => {}}
          onDeleteFile={() => {}}
          onDeleteFolder={() => {}}
          onRenameFile={() => {}}
          onRenameFolder={() => {}}
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
                  {openFiles.length} file{openFiles.length !== 1 ? "s" : ""} open
                  {hasUnsavedChanges && " • Unsaved changes"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveFile}
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
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleAIAssistant}
                      aria-label="Open AI Assistant"
                    >
                      <Bot className="h-4 w-4" />
                    </Button>
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
                    <PlaygroundEditor
                      activeFile={activeFile}
                      content={activeFile?.content || ""}
                      onContentChange={(value) => {
                        // Update file content in state
                      }}
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