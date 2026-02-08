"use client";

import React, { useEffect, useState, useCallback, useRef, use } from "react";
import { useParams } from "next/navigation";
import { Save, Bot, Settings, FileText, X, AlertCircle, ExternalLink } from "lucide-react";

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { fileSyncService } from "@/modules/playground/services/file-sync-service";
import { webContainerService } from "@/modules/webContainers/services/webContainer-services";
import { StartCollabButton } from "@/modules/collaboration/components/StartCollaborationButton";
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
import { Github } from "lucide-react";
import { CreateGithubRepoDialog,RepoCreationData } from "@/modules/playground/components/dialogs/create-github-repo-dialog";
import { createGitHubRepository } from "@/modules/github/actions";
import { convertTemplateToFiles } from "@/modules/playground/lib/template-to-files";
import { useRouter } from "next/navigation";
import TerminalComponent,{TerminalRef} from "@/modules/webContainers/components/terminal";
import { set } from "zod";



function MainPlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [createRepoDialogOpen, setCreateRepoDialogOpen] = useState(false);
  const [manualServerUrl, setManualServerUrl] = useState<string | null>(null);
  const [terminalServerUrl, setTerminalServerUrl] = React.useState<string | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const router = useRouter();

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);
  const AiSuggestions = UseAiSuggestions();
  const terminalRef = useRef<TerminalRef>(null)
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
    serverUrl,
    isLoading: webContainerLoading,
    error: webContainerError,
    instance: webContainerInstance,
    writeFileSync,
    restartServer,isReady,startServer
  } = useWebContainer({ templateData,projectId:id,terminalRef,autoStart:false });

  const lastSyncedContent = useRef<Map<string, string>>(new Map());
  const autoStartAttempted = useRef<boolean>(false);

  useEffect(() => {
    setPlaygroundId(id);
    closeAllFiles();
    setActiveFileId(null)
    autoStartAttempted.current = false;
    setIsTerminalReady(false);
  }, [id, setPlaygroundId,closeAllFiles,setActiveFileId]);

  useEffect(() => {
  if (id) {
    console.log("📌 Current playground ID:", id);
    webContainerService.setCurrentProject(id);
  }
}, [id]);

useEffect(() => {
  if (templateData) {
    console.log("📦 Template data loaded for project:", id);
  }
}, [templateData, id]);

  const requiresServerRestart = (filename:string,extension:string):boolean=>{
   const fullName = `${filename}.${extension}`;
   const restartFiles = ["package.json","tsconfig.json","webpack.config.js","next.config.js","vite.config.js",".env",".env.local"];
    return restartFiles.includes(fullName);
  }



  useEffect(() => {
  // Wait 5 seconds after WebContainer instance is available
  if (webContainerInstance && !serverUrl && !manualServerUrl) {
    console.log("⚠️ No serverUrl detected, trying manual URL...");
    
    setTimeout(() => {
      // Try to get URL from service
      const url = webContainerService.getServerUrl();
      console.log("🔍 Manual check - service URL:", url);
      
      if (url) {
        setManualServerUrl(url);
        console.log("✅ Using manual URL:", url);
      } else {
        console.log("❌ Still no URL from service");
      }
    }, 5000);
  }
}, [webContainerInstance, serverUrl, manualServerUrl]);
useEffect(() => {
 if (!isReady || !webContainerInstance) {
      console.log("⏳ Waiting for WebContainer to be ready...");
      return;
    }
    
    if (!isTerminalReady) {
      console.log("⏳ Waiting for terminal shell to initialize...");
      return;
    }
    
    if (autoStartAttempted.current) {
      console.log("⏭️ Auto-start already attempted");
      return;
    }
    
    if (webContainerService.isServerRunning()) {
      console.log("⏭️ Server already running");
      return;
    }
  autoStartAttempted.current = true;
  
  const timer = setTimeout(async()=>{
    console.log("⏱️ Auto-starting dev server");
    try {
      await startServer();
    } catch (error) {
      console.error("Auto-start failed:", error);
      autoStartAttempted.current = false;
      
    }
  },1500)
  
  return () => clearTimeout(timer);
}, [isReady, webContainerInstance, isTerminalReady, startServer]);

useEffect(()=>{
  const handleTerminalReady = () => {
    console.log("✅ Terminal shell is ready");
    setIsTerminalReady(true);
  }

  window.addEventListener('terminalReady', handleTerminalReady);
  return () => {
    window.removeEventListener('terminalReady', handleTerminalReady);
  };
  
},[])

useEffect(() => {
  if (!webContainerInstance || !templateData) return;

  console.log("🔍 Setting up package.json listener...");

  const handlePackageJsonChange = async (data: { content: string }) => {
    console.log("📦 package.json changed in WebContainer!");
    
    try {
      // Parse the new content
      const newPkg = JSON.parse(data.content);
      console.log("New dependencies:", Object.keys(newPkg.dependencies || {}));
      
      // Clone template data
      const updatedTemplateData = JSON.parse(JSON.stringify(templateData));
      
      // Find and update package.json in template
      let found = false;
      for (let i = 0; i < updatedTemplateData.items.length; i++) {
        const item = updatedTemplateData.items[i];
        if (item.filename === "package" && item.fileExtension === "json") {
          console.log("✅ Updating package.json in template");
          updatedTemplateData.items[i].content = data.content;
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.warn("❌ package.json not found in template");
        return;
      }
      
      // Update Zustand store
      setTemplateData(updatedTemplateData);
      
      // Save to database
      await saveTemplateData(updatedTemplateData);
      
      // Update open file if package.json is open
      const openPkgJson = openFiles.find(
        f => f.filename === "package" && f.fileExtension === "json"
      );
      
      if (openPkgJson) {
        const updatedOpenFiles = openFiles.map(f => 
          f.id === openPkgJson.id 
            ? { 
                ...f, 
                content: data.content, 
                originalContent: data.content, 
                hasUnsavedChanges: false 
              }
            : f
        );
        setOpenFiles(updatedOpenFiles);
      }
      
      toast.success("📦 package.json synced from terminal");
      
    } catch (error) {
      console.error("Failed to sync package.json:", error);
      toast.error("Failed to sync package.json");
    }
  };

  // Register listener
  webContainerService.on("package-json-changed", handlePackageJsonChange);

  // Cleanup
  return () => {
    webContainerService.off("package-json-changed", handlePackageJsonChange);
  };
}, [webContainerInstance, templateData, openFiles, setTemplateData, saveTemplateData, setOpenFiles]);


  useEffect(() => {
    if (templateData && !openFiles.length) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  useEffect(()=>{
    const handleFileChanged = (event:CustomEvent) =>{
      const {path,content} = event.detail
      console.log(`Terminal updated file:${path}`);
      if(!templateData)return;
      const fileName = path.split('/').pop()
      const activelyEditedFile = openFiles.find(
        (f)=>`${f.filename}.${f.fileExtension}` === fileName && f.hasUnsavedChanges
      );
      if(activelyEditedFile){
        console.log(`Skipping sync - file ${fileName} has unsaved changes`)
        toast.info(`${fileName} has unsaved changes .Save to sync with terminal`)
        return;
      }
      const updatedTemplateData = JSON.parse(JSON.stringify(templateData));
    
    const updateFileInTree = (items: any[]): any[] => {
      return items.map((item) => {
        if ("folderName" in item) {
          return {
            ...item,
            items: updateFileInTree(item.items)
          };
        } else {
          const itemPath = `${item.filename}.${item.fileExtension}`;
          if (path.endsWith(itemPath)) {
            console.log(`✅ Updated ${itemPath} from terminal`);
            return { ...item, content };
          }
          return item;
        }
      });
    };

        updatedTemplateData.items = updateFileInTree(updatedTemplateData.items);
    setTemplateData(updatedTemplateData);
    
    // Update open files (only if not being edited)
    const updatedOpenFiles = openFiles.map((file) => {
      const filePath = `${file.filename}.${file.fileExtension}`;
      if (path.endsWith(filePath) && !file.hasUnsavedChanges) {
        return {
          ...file,
          content,
          originalContent: content,
          hasUnsavedChanges: false
        };
      }
      return file;
    });
    
    setOpenFiles(updatedOpenFiles);
    
    toast.success(`Synced ${path.split('/').pop()} from terminal`);
  };

  window.addEventListener('packageJsonUpdated', handleFileChanged as EventListener);
  
  return () => {
    window.removeEventListener('packageJsonUpdated', handleFileChanged as EventListener);
  };

    
  },[templateData, openFiles, setTemplateData, setOpenFiles])

  const handleCreateRepo = async (data: RepoCreationData) => {
    if(!templateData){
      toast.error("No template data available")
      return
    }

    try {
      const files = convertTemplateToFiles(templateData)
      const result = await createGitHubRepository(data,files);
      if(result.success){
         toast.success(
        `Repository "${data.name}" created successfully!`,
        { id: "create-repo" }
      )

      // ✅ Add longer delay for GitHub to fully initialize
     toast.loading("Waiting for GitHub to initialize repository...", { id: "redirect" })
      
      // Wait 3 seconds before redirecting
      await new Promise(resolve => setTimeout(resolve, 7000));
      toast.success("Repository ready!", { id: "redirect" })
      const encodedRepoFullName = encodeURIComponent(result.data.fullName)
      router.push(`/playground/github/${encodedRepoFullName}`)

      }else{
        toast.error(result.error || "Failed to create repository")
      }


    } catch (error) {
      console.error("Create repo error",error)
      toast.error("An error occured while creating the repository")
      
    }
  }

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
      if (!targetFile) {
        toast.error("No active file to save");
        return;

      }


      const fileToSave = openFiles.find((file) => file.id === targetFile);
      if (!fileToSave || !fileToSave.hasUnsavedChanges){
        toast.info("No changes to save");
        return;
      }

      const latestTemplateData = useFileExplorer.getState().templateData;
      if (!latestTemplateData){
        toast.error("No template data available");
        return;
      }

      try {
        
        const filepath = findFilePath(fileToSave,latestTemplateData);
        if(!filepath){
          throw new Error("File Path not found");

        }

        await fileSyncService.syncFileImmediate(filepath,fileToSave.content)
        const needsRestart = requiresServerRestart(fileToSave.filename,fileToSave.fileExtension)
        if(needsRestart && webContainerService.isServerRunning()){
          toast.loading("Restarting dev server .... ",{id:`save-${targetFile}`});
          await webContainerService.restartDevServer()
        }
        const updatedTemplateData = JSON.parse(JSON.stringify(latestTemplateData));
        const updateFileContentRecursive = (items:any[], parentPath:string = ""):any[]=>items.map((item)=>{
          if("folderName" in item){
            const currentPath = parentPath ? `${parentPath}/${item.folderName}` : item.folderName;
            return {
              ...item,items:updateFileContentRecursive(item.items, currentPath)
            }
          }else{
            const currentPath = parentPath ? `${parentPath}/${item.filename}.${item.fileExtension}` : `${item.filename}.${item.fileExtension}`;
            const filePath = fileToSave.path 
              ? `${fileToSave.path}/${fileToSave.filename}.${fileToSave.fileExtension}`
              : `${fileToSave.filename}.${fileToSave.fileExtension}`;
            
            // ✅ FIX: Compare both filename and full path
            if(currentPath === filePath){
              return {...item,content:fileToSave.content}
            }
            return item;
          }
        });

        updatedTemplateData.items = updateFileContentRecursive(updatedTemplateData.items)
        const newTemplateData = await saveTemplateData(updatedTemplateData);
        if(!newTemplateData){
          throw new Error("Failed to save to Database")
        }

        setTemplateData(newTemplateData);
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
        `Saved ${fileToSave.filename}.${fileToSave.fileExtension}`,
        { id: `save-${targetFile}` }
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

  const handleOpenPreviewInNewTab = () => {
    if (serverUrl || manualServerUrl) {
      const previewUrl = serverUrl || manualServerUrl;
      const encodedUrl = encodeURIComponent(previewUrl);
      const apiUrl = `/api/webcontainer/${id}?url=${encodedUrl}`;
      window.open(apiUrl, "_blank");
    } else {
      toast.error("Preview server is not ready yet");
    }
  };

  const handleContentChange = useCallback(
  (value: string) => {
    console.log("🔄 handleContentChange called with value length:", value.length);
    
    if (!activeFile) {
      console.warn("⚠️ No active file set");
      return;
    }

    console.log("📄 Active file:", {
      filename: activeFile.filename,
      extension: activeFile.fileExtension,
      path: activeFile.path,
      id: activeFile.id
    });

    // Update UI immediately
    updateFileContent(activeFile.id, value);
    console.log("✏️ Updated UI for file", activeFile.id);

    // Get template data from Zustand store
    const templateData = useFileExplorer.getState().templateData;
    if (!templateData) {
      console.warn("❌ No template data available for file sync");
      return;
    }

    // Find the correct file path using the file object which includes path property
    const filePath = findFilePath(activeFile, templateData);
    console.log("🔍 File path resolution:", {
      resolved: filePath,
      fileName: activeFile.filename,
      fileExt: activeFile.fileExtension,
      filePath: activeFile.path
    });

    if (!filePath) {
      console.warn(`❌ Could not find file path for ${activeFile.filename}.${activeFile.fileExtension}`);
      return;
    }

    console.log(`📝 Starting sync for: ${filePath}`);
    
    // Queue for debounced writes to persist to database
    fileSyncService.queueFileChange(filePath, value);
    console.log(`⏳ Queued ${filePath} for debounced database sync (500ms)`);
    console.log("📄 Active file:", {
  filename: activeFile.filename,
  extension: activeFile.fileExtension,
  path: activeFile.path,  // ← What does this show?
  id: activeFile.id
});
    
    // Also write immediately to WebContainer for hot reload support
    if (webContainerInstance) {
      console.log(`🚀 Writing ${filePath} IMMEDIATELY to WebContainer for hot reload`);
      writeFileSync?.(filePath, value)
        .then(() => {
          console.log(`✅ Successfully wrote ${filePath} to WebContainer`);
          // 🔥 FIX: Emit a custom event to trigger preview refresh
          window.dispatchEvent(new CustomEvent("webcontainerFileChange", {
            detail: { filePath, content: value }
          }));
          console.log(`📡 Dispatched file change event for preview refresh`);
        })
        .catch((error) => {
          console.error(`❌ Failed to sync ${filePath} immediately:`, error);
        });
    } else {
      console.warn(`⚠️ WebContainer instance not available yet (hot reload disabled)`);
    }
  },
  [activeFile, updateFileContent, webContainerInstance, writeFileSync]
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
        onClick={() => setCreateRepoDialogOpen(true)}
        aria-label="Create GitHub Repository"
      >
        <Github className="h-4 w-4 mr-2" />
        Push to GitHub
      </Button>
    </TooltipTrigger>
    <TooltipContent>Create GitHub Repository</TooltipContent>
  </Tooltip><div className="text-xs bg-yellow-100 p-2 rounded">
  Template loaded: {templateData ? "✅" : "❌"} 
  {templateData && ` | Items: ${templateData.items?.length || 0}`}
</div>
                <StartCollabButton playgroundId={id} playgroundName={playgroundData?.name} templateData={templateData} />
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

                {/* <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleAI isEnabled={AiSuggestions.isEnabled}
                    onToggle={AiSuggestions.toggleEnabled}
                    suggestionLoading={AiSuggestions.isLoading}
                    />
                  </TooltipTrigger>
                  <TooltipContent>AI Assistant</TooltipContent>
                </Tooltip> */}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={isPreviewVisible ? "default" : "outline"}
                      onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                      aria-label="Toggle preview"
                    >
                      {isPreviewVisible ? "Hide" : "Show"} Preview
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isPreviewVisible ? "Hide" : "Show"} Preview Panel</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleOpenPreviewInNewTab}
                      disabled={!serverUrl && !manualServerUrl}
                      aria-label="Open preview in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open Preview in New Tab</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={closeAllFiles}>
                      Close All Files
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CreateGithubRepoDialog
  open={createRepoDialogOpen}
  onOpenChange={setCreateRepoDialogOpen}
  onCreateRepo={handleCreateRepo}
  playGroundName={playgroundData?.name || "playground"}
/>
              </div>
            </div>
          </header>

          {/* File Tabs */}
          {openFiles.length > 0 && (
            <div className="border-b border-border bg-muted/30">
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {openFiles.map((file) => {
                    // 🔥 FIX: Show full path if there are duplicate filenames
                    const isDuplicate = openFiles.some(
                      (f) =>
                        f.filename === file.filename &&
                        f.fileExtension === file.fileExtension &&
                        f.id !== file.id
                    );
                    const displayName = isDuplicate && file.path
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
                      //onContentChange={(value)=>activeFileId&&updateFileContent(activeFileId, value)}
                      onContentChange={handleContentChange}
                      suggestions={AiSuggestions.suggestions}
                      suggestionLoading = {AiSuggestions.isLoading}
                      suggestionPosition = {AiSuggestions.position}
                      onAcceptSuggestion = {(editor,monaco)=>AiSuggestions.acceptSuggestion(editor,monaco)}
                      onRejectSuggestion = {(editor)=>AiSuggestions.rejectSuggestion(editor)}
                      onTriggerSuggestion = {(type,editor)=>AiSuggestions.fetchSuggestion(type,editor)}
                      serverUrl={serverUrl || manualServerUrl}
                    />
                  </div>
                </ResizablePanel>

                {isPreviewVisible && templateData && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={50}>
                      <WebContainerPreview
                        templateData={templateData}
                        serverUrl={terminalServerUrl || serverUrl}
                        isLoading={webContainerLoading}
                        error={webContainerError}
                        instance={webContainerInstance}
                        writeFileSync={writeFileSync}
                        terminalRef={terminalRef}  // ← Add this line
                        showTerminal={true}  // ← ADD THIS
    onServerReady={(url:any) => {  // ← ADD THIS
    console.log("📡 Terminal reported server ready:", url);
    setTerminalServerUrl(url);
  }}
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