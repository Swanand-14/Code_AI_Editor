"use client"
//github single user playground
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { 
  fetchRepositoryTree, 
  fetchFileContent, 
  saveFileToGitHub, 
  createFileInGitHub, 
  createFolderInGitHub, 
  deleteFileFromGitHub, 
  deleteFolderFromGithub 
} from "../actions"
import { GitHubFileTree } from "./github-file-tree"
import { BranchSelector } from "./branch-selector"
import PlaygroundEditor from "@/modules/playground/components/playgroundEditor"
import { WebContainerPreview } from "@/modules/webContainers/components/WebContainerPreview"
import { useWebContainerForGithub } from "@/modules/webContainers/hooks/useWebContainerForGithub"
import { Button } from "@/components/ui/button"
import { GitCommit, Loader2, RefreshCw, ArrowLeft, GitCompare, Play, Square } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { NewFileDialog } from "./dialogs/new-file-dialog"
import { NewFolderDialog } from "./dialogs/new-folder-dialog"
import { DiffViewer } from "./diff-viewer"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import TerminalComponent,{TerminalRef} from "@/modules/webContainers/components/terminal"
import { webContainerService } from "@/modules/webContainers/services/webContainer-services"
import { fileCreationWatcher } from "@/modules/webContainers/services/fileWatcher"
import { useGitWorkspace } from "../hooks/Usegitworkspace"
import { useWorkspaceAutosave} from "../hooks/useWorkspaceAutoSave"
import { useRestoreDraft } from "../hooks/useRestoreDraft"
import { useActiveFile,useChangeCount } from "../hooks/Usegitworkspace"
import { commitAllChangesToGitHub, deleteWorkspaceDraft } from "../actions/index"
import { SourceControlPanel } from "./SourceControlPanel"
import { Separator } from "@/components/ui/separator"

interface GitHubFile {
  name: string
  path: string
  sha: string
  size: number
  type: "file" | "dir"
  content?: string
}

export default function GitHubPlayground({ repoFullName }: { repoFullName: string }) {
  const [owner, repo] = repoFullName.split("/")
  const [currentBranch, setCurrentBranch] = useState("main")
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false)
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [currentContextPath, setCurrentContextPath] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<GitHubFile | null>(null)
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)
  const [folderToDelete, setFolderToDelete] = useState<{ path: string; name: string } | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]))
  const [showDiff, setShowDiff] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const terminalRef = useRef<TerminalRef>(null)
  const [isTerminalReady, setIsTerminalReady] = useState(false)
  const autoStartAttempted = useRef(false)
  const manuallyCreatedFilesRef = useRef<Set<string>>(new Set())
  const [showSourceControl, setShowSourceControl] = useState(false)
  const [diffFilePath, setDiffFilePath] = useState<string | null>(null)
  const [draftRestoredAt, setDraftRestoredAt] = useState(0)
  
  const router = useRouter()

  // ✅ Git Workspace Store
  const {
    files,
    initializeWorkspace,
    beginBranchSwitch,
    openFile: openFileInWorkspace,
    closeFile,
    closeAllFiles,
    updateFileContent,
    getAllChanges,
    hasUnsavedChanges,
    modifiedFiles,
    createdFiles,
    deletedFiles,
    addFileToTree,
    removeFileFromTree,
    updateFileInTree,
    markFileCreated,
    markFileDeleted,
    unstageAllFiles,
    unmarkFileCreated,
    isSwitchingBranch
  } = useGitWorkspace()

  const activeFile = useActiveFile()
  const changeCount = useChangeCount()
  const openFiles = useGitWorkspace(state => state.openFiles)
const remoteState = useGitWorkspace(state => state.remoteState)

  // ✅ Auto-save to MongoDB
  useWorkspaceAutosave({
    repoFullName,
    currentBranch,
    enabled: true,
  })

  // ✅ Restore draft on load
  const { isRestoring, restoreDraft } = useRestoreDraft()

  // WebContainer integration
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
    writeFileSync,
    isReady
  } = useWebContainerForGithub({
    files,
    repoFullName,
    currentBranch,
    terminalRef,
    autoStart: false,
  })
    async function loadRepositoryTree(retryCount = 0, maxTries = 3) {
    setIsLoadingTree(true)
    try {
      const result = await fetchRepositoryTree(owner, repo, currentBranch)
      
      if (result.success) {
        const filesWithContent = await Promise.all(
          result.data.map(async (file: GitHubFile) => {
            if (file.type === "file") {
              const contentResult = await fetchFileContent(
                owner,
                repo,
                file.path,
                currentBranch
              )
              if (contentResult.success) {
                return { ...file, content: contentResult.data }
              }
            }
            return file
          })
        )
        
        // ✅ Initialize workspace
        initializeWorkspace(repoFullName, currentBranch, filesWithContent)
        await restoreDraft(repoFullName, currentBranch,null)
        setDraftRestoredAt(prev => prev + 1) 
        
        
        
      } else {
        if (retryCount < maxTries && result.error?.includes("404")) {
          toast.loading(`Repository initializing... Retry ${retryCount + 1}/${maxTries}`, {
            id: "load-tree"
          })
          await new Promise(resolve => setTimeout(resolve, 2000))
          return loadRepositoryTree(retryCount + 1, maxTries)
        }
        toast.error(result.error || "Failed to load repository")
      }
    } catch (error) {
      console.error("Error loading tree", error)
      toast.error("Failed to load repository")
    } finally {
      setIsLoadingTree(false)
    }
  }

  useEffect(() => {
    autoStartAttempted.current = false
    setIsTerminalReady(false)
    loadRepositoryTree()
  }, [currentBranch])



  useEffect(() => {
    const handleTerminalReady = () => {
      console.log("Terminal ready event received")
      setIsTerminalReady(true)
    }

    window.addEventListener("terminalReady", handleTerminalReady)
    return () => {
      window.removeEventListener("terminalReady", handleTerminalReady)
    }
  }, [])

  useEffect(() => {
    console.log("🔄 [GITHUB] Auto-start useEffect triggered", {
      isReady,
      isTerminalReady,
      isServerRunning,
      autoStartAttempted: autoStartAttempted.current,
      isSupported: isWebContainerSupported
    })

    if (!isWebContainerSupported) {
      console.log("⏭️ [GITHUB] Skipping auto-start - project not supported")
      return
    }
    
    if (!isReady) {
      console.log("⏳ [GITHUB] WebContainer not ready yet")
      return
    }
    
    if (!isTerminalReady) {
      console.log("⏳ [GITHUB] Terminal not ready yet")
      return
    }
    
    if (autoStartAttempted.current) {
      console.log("⏭️ [GITHUB] Auto-start already attempted")
      return
    }
    
    if (isServerRunning) {
      console.log("⏭️ [GITHUB] Server already running")
      return
    }
    
    console.log("✅ [GITHUB] All conditions met - scheduling auto-start")
    autoStartAttempted.current = true
    
    const timer = setTimeout(async () => {
      console.log("🚀 [GITHUB] Executing auto-start now")
      
      try {
        await startServer()
        setShowPreview(true)
        console.log("✅ [GITHUB] Auto-start completed successfully")
      } catch (err) {
        console.error("❌ [GITHUB] Auto-start failed:", err)
        autoStartAttempted.current = false
      }
    }, 1500)
    
    return () => {
      console.log("🧹 [GITHUB] Auto-start useEffect cleanup")
      clearTimeout(timer)
    }
  }, [isReady, isTerminalReady, isServerRunning, isWebContainerSupported, startServer])

  useEffect(() => {
    if (!isWebContainerSupported || !webContainerInstance) return
    console.log("📡 Setting up package.json event listeners")
    
    const handlePackageJsonChange = async (data: { content: string }) => {
      console.log("📦 [GITHUB] package.json changed in WebContainer!")
      
      try {
        const newPkg = JSON.parse(data.content)
        console.log("[GITHUB] New dependencies:", Object.keys(newPkg.dependencies || {}))
        
        const packageJsonFile = files.find(
          f => f.path === "package.json" || f.path.endsWith("/package.json")
        )
        
        if (!packageJsonFile) {
          console.warn("❌ [GITHUB] package.json not found in files")
          return
        }
        
        // ✅ Update via store
        updateFileInTree(packageJsonFile.path, { content: data.content })
        
        // ✅ If package.json is currently open, update it
        if (activeFile?.path === packageJsonFile.path) {
          console.log("📝 [GITHUB] Updating open package.json file")
          updateFileContent(packageJsonFile.path, data.content)
        }
        
        toast.success("📦 package.json synced from terminal")
        
      } catch (error) {
        console.error("[GITHUB] Failed to sync package.json:", error)
        toast.error("Failed to sync package.json")
      }
    }

    webContainerService.on("package-json-changed", handlePackageJsonChange)

    return () => {
      webContainerService.off("package-json-changed", handlePackageJsonChange)
    }
  }, [isWebContainerSupported, webContainerInstance, files, activeFile, updateFileInTree, updateFileContent, owner, repo, currentBranch])

  function handleBranchChange(branch: string) {
    if(branch === currentBranch) return
    beginBranchSwitch(branch)
    setExpandedDirs(new Set([""]))
    setShowPreview(false)
    setShowDiff(false)
    setDiffFilePath(null)
    setCurrentBranch(branch)
    
    
    toast.success(`Switched to ${branch}`)
  }

  async function handleFileSelect(file: GitHubFile) {
    if (file.type === "dir") return
    
    openFileInWorkspace(file)
    
    if (webContainerInstance && isReady) {
      const content = file.content || ''
      await webContainerInstance.fs.writeFile(`/${file.path}`, content, 'utf-8')
    }
  }

  function handleContentChange(newContent: string) {
    if (!activeFile) return
    
    updateFileContent(activeFile.path, newContent)

    if (isWebContainerSupported && webContainerInstance) {
      webContainerInstance.fs.writeFile(`/${activeFile.path}`, newContent, 'utf-8')
        .catch(console.error)
    }
  }

  async function handleCommit(message: string, description?: string) {
    if (!message.trim()) {
      toast.error("Please enter a commit message")
      return
    }

    setIsSaving(true)
    
    try {
      const changes = getAllChanges()
      
      if (changes.length === 0) {
        toast.error("No changes to commit")
        return
      }
      
      const fullMessage = description?.trim() ? `${message}\n\n${description}` : message
      
      const result = await commitAllChangesToGitHub(
        owner,
        repo,
        changes,
        fullMessage,
        currentBranch
      )
      
      if (result.success) {
        toast.success(`Committed ${changes.length} file(s)`)
        
        initializeWorkspace(repoFullName, currentBranch, result.updatedFiles)
        
        await deleteWorkspaceDraft(repoFullName, currentBranch)
        
        
        
        await loadRepositoryTree()
      } else {
        toast.error(result.error || "Failed to commit changes")
      }
    } finally {
      setIsSaving(false)
    }
  }

  function handleCreateFileClick(path: string) {
    setCurrentContextPath(path)
    setNewFileDialogOpen(true)
  }

  async function handleCreateFile(path: string, filename: string) {
      const fullPath = path ? `${path}/${filename}` : filename

  // Check if file already exists locally
  const exists = files.some(f => f.path === fullPath)
  if (exists) {
    toast.error(`File "${filename}" already exists`)
    return
  }

  const newFile: GitHubFile = {
    name: filename,
    path: fullPath,
    sha: '',           // empty — not yet on GitHub
    size: 0,
    type: "file",
    content: ""
  }

  // Add to local tree + mark as created (no GitHub API call)
  addFileToTree(newFile)
  markFileCreated(fullPath)

  if (path) {
    setExpandedDirs(prev => new Set([...prev, path]))
  }

  // Open it so user can start editing
  openFileInWorkspace(newFile)

  // If WebContainer is running, write it there too
  if (webContainerInstance && isReady) {
    await webContainerInstance.fs.writeFile(`/${fullPath}`, '', 'utf-8')
  }

  toast.success(`Created ${filename}`, { description: 'Stage and commit when ready' })
    
  }

  function handleCreateFolderClick(path: string) {
    setCurrentContextPath(path)
    setNewFolderDialogOpen(true)
  }

  async function handleCreateFolder(path: string, folderName: string) {
      const fullPath = path ? `${path}/${folderName}` : folderName

  // We represent a folder via a placeholder .gitkeep file locally
  const gitkeepPath = `${fullPath}/.gitkeep`

  const exists = files.some(f => f.path === gitkeepPath)
  if (exists) {
    toast.error(`Folder "${folderName}" already exists`)
    return
  }

  const placeholderFile: GitHubFile = {
    name: ".gitkeep",
    path: gitkeepPath,
    sha: '',
    size: 0,
    type: "file",
    content: ""
  }

  // Add placeholder to tree + mark as created (no GitHub API call)
  addFileToTree(placeholderFile)
  markFileCreated(gitkeepPath)

  // Expand the new folder immediately
  setExpandedDirs(prev => new Set([...prev, ...(path ? [path] : []), fullPath]))

  // Mirror in WebContainer if running
  if (webContainerInstance && isReady) {
    await webContainerInstance.fs.mkdir(`/${fullPath}`, { recursive: true })
    await webContainerInstance.fs.writeFile(`/${gitkeepPath}`, '', 'utf-8')
  }

  toast.success(`Created ${folderName}/`, { description: 'Stage and commit when ready' })
  }

  function handleDeleteFileClick(file: GitHubFile) {
    setFileToDelete(file)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteFile() {
      if (!fileToDelete) return

  const isLocalOnly = !fileToDelete.sha // Never pushed to GitHub

  // Close if currently open
  if (activeFile?.path === fileToDelete.path) {
    closeFile(fileToDelete.path)
  }

  if (isLocalOnly) {
    // Pure local file — remove from tree and untrack, nothing to commit
    removeFileFromTree(fileToDelete.path)
    unmarkFileCreated(fileToDelete.path)
    toast.success(`Deleted ${fileToDelete.name}`)
  } else {
    // GitHub file — stage for deletion, commit later
    removeFileFromTree(fileToDelete.path)
    markFileDeleted(fileToDelete.path)
    toast.success(`${fileToDelete.name} staged for deletion`, {
      description: 'Commit via Source Control when ready'
    })
  }

  // Remove from WebContainer filesystem if running
  if (webContainerInstance && isReady) {
    try {
      await webContainerInstance.fs.rm(`/${fileToDelete.path}`)
    } catch (e) { /* file may not exist in WC, ignore */ }
  }

  setDeleteDialogOpen(false)
  setFileToDelete(null)
  }

  function handleDeleteFolderClick(folderPath: string, folderName: string) {
    setFolderToDelete({ path: folderPath, name: folderName })
    setDeleteFolderDialogOpen(true)
  }

  async function handleDeleteFolder() {
    if (!folderToDelete)return

  const folderFiles = files.filter(
    file =>
      file.path.startsWith(folderToDelete.path + '/') ||
      file.path === folderToDelete.path
  )

  if (folderFiles.length === 0) {
    toast.error("No files found in folder")
    return
  }

  // Close any open files from this folder
  if (activeFile && activeFile.path.startsWith(folderToDelete.path + '/')) {
    closeFile(activeFile.path)
  }

  // Collapse expanded dirs
  setExpandedDirs(prev => {
    const next = new Set(prev)
    next.delete(folderToDelete.path)
    Array.from(next).forEach(path => {
      if (path.startsWith(folderToDelete.path + '/')) next.delete(path)
    })
    return next
  })

  let stagedCount = 0
  let removedCount = 0

  folderFiles.forEach(file => {
    removeFileFromTree(file.path)

    if (!file.sha) {
      // Local-only file — just untrack
      unmarkFileCreated(file.path)
      removedCount++
    } else {
      // GitHub file — stage for deletion
      markFileDeleted(file.path)
      stagedCount++
    }
  })

  // Mirror in WebContainer
  if (webContainerInstance && isReady) {
    try {
      await webContainerInstance.fs.rm(`/${folderToDelete.path}`, { recursive: true })
    } catch (e) { /* ignore */ }
  }

  if (stagedCount > 0 && removedCount > 0) {
    toast.success(`Folder staged for deletion`, {
      description: `${stagedCount} file(s) to commit, ${removedCount} local file(s) removed`
    })
  } else if (stagedCount > 0) {
    toast.success(`${folderToDelete.name}/ staged for deletion`, {
      description: 'Commit via Source Control when ready'
    })
  } else {
    toast.success(`Deleted ${folderToDelete.name}/`)
  }

  setDeleteFolderDialogOpen(false)
  setFolderToDelete(null)

  }

  async function handleRenameFile(file: GitHubFile, newName: string) {
  // Build the new path — same directory, new filename
  const dir = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : ""
  const newPath = dir ? `${dir}/${newName}` : newName

  // Guard: new path already exists
  if (files.some(f => f.path === newPath)) {
    toast.error(`"${newName}" already exists`)
    return
  }

  // ── Step 1: Handle old path (delete side) ──
  if (activeFile?.path === file.path) {
    closeFile(file.path)
  }

  removeFileFromTree(file.path)

  if (!file.sha) {
    // Local-only file — just untrack
    unmarkFileCreated(file.path)
  } else {
    // GitHub file — stage for deletion
    markFileDeleted(file.path)
  }

  // ── Step 2: Handle new path (add side) ──
  // Carry over the content from the old file
  const currentContent =
    openFiles.find(f => f.path === file.path)?.content ??
    file.content ??
    ""

  const newFile: GitHubFile = {
    name: newName,
    path: newPath,
    sha: "",           // not on GitHub yet
    size: currentContent.length,
    type: "file",
    content: currentContent,
  }

  addFileToTree(newFile)
  markFileCreated(newPath)

  // Open the renamed file so user doesn't lose their place
  openFileInWorkspace(newFile)

  // Mirror in WebContainer if running
  if (webContainerInstance && isReady) {
    try {
      // Write new path
      const dir = newPath.split("/").slice(0, -1).join("/")
      if (dir) await webContainerInstance.fs.mkdir(`/${dir}`, { recursive: true })
      await webContainerInstance.fs.writeFile(`/${newPath}`, currentContent, "utf-8")
      // Remove old path
      await webContainerInstance.fs.rm(`/${file.path}`)
    } catch (e) {
      console.warn("WC rename sync failed:", e)
    }
  }

  toast.success(`Renamed to ${newName}`, {
    description: "Staged as D + A. Commit via Source Control.",
  })
}
  useEffect(() => {
  if (!isReady || !webContainerInstance) return
  if(draftRestoredAt === 0) return;

  const state = useGitWorkspace.getState()
  const { modifiedFiles, createdFiles, openFiles, deletedFiles } = state

  // No draft changes to apply
  if (modifiedFiles.size === 0 && createdFiles.size === 0 && deletedFiles.size === 0) return

  console.log('🔄 [GITHUB] Applying draft state to WC filesystem...')

  async function applyDraftToWC() {
    // Write modified files — overwrite GitHub content with draft content
    for (const path of modifiedFiles) {
      const openFile = openFiles.find(f => f.path === path)
      if (openFile?.content) {
        try {
          await webContainerInstance.fs.writeFile(`/${path}`, openFile.content, 'utf-8')
          console.log(`✅ [GITHUB] Applied modified draft: ${path}`)
        } catch (e) {
          console.warn(`⚠️ [GITHUB] Failed to apply modified draft: ${path}`, e)
        }
      }
    }

    // Write created files — these don't exist in GitHub mount
    for (const path of createdFiles) {
      const openFile = openFiles.find(f => f.path === path)
      const content = openFile?.content ?? ''
      try {
        // Ensure parent dir exists
        const dir = path.split('/').slice(0, -1).join('/')
        if (dir) await webContainerInstance.fs.mkdir(`/${dir}`, { recursive: true })
        await webContainerInstance.fs.writeFile(`/${path}`, content, 'utf-8')
        console.log(`✅ [GITHUB] Applied created draft: ${path}`)
      } catch (e) {
        console.warn(`⚠️ [GITHUB] Failed to apply created draft: ${path}`, e)
      }
    }

    // Delete staged-for-deletion files — cleanupStaleFiles won't catch these
    // because they ARE in the GitHub tree (have sha), just staged for deletion
    for (const path of deletedFiles) {
      try {
        await webContainerInstance.fs.rm(`/${path}`)
        console.log(`✅ [GITHUB] Applied deleted draft: ${path}`)
      } catch (e) {
        // File may already not exist, ignore
      }
    }

    console.log('✅ [GITHUB] Draft state applied to WC filesystem')
  }

  applyDraftToWC()
}, [isReady, webContainerInstance,draftRestoredAt])

  // ✅ Keyboard shortcut - using activeFile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        if (activeFile?.hasChanges) {
          setCommitDialogOpen(true)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeFile])

  // ✅ File watcher - using store methods
  useEffect(() => {
    if (!webContainerInstance || !isReady || !isWebContainerSupported) return
    
    console.log("🚀 [GITHUB] Starting file watcher...")
    
const handleFileCreated = async (filePath: string, parentPath: string) => {
      if (manuallyCreatedFilesRef.current.has(filePath)) {
        console.log(`⏭️ Ignoring manually created: ${filePath}`)
        return
      }
      if(useGitWorkspace.getState().isSwitchingBranch)return;
      
      console.log(`📄 [GITHUB] File created: ${filePath}`)
      
      try {
        const content = await webContainerInstance.fs.readFile(`/${filePath}`, 'utf-8')
        
        const newFile: GitHubFile = {
          name: filePath.split('/').pop() || '',
          path: filePath,
          sha: '',
          size: content.length,
          type: 'file',
          content,
          url: '',
        }
        
        addFileToTree(newFile)
        markFileCreated(filePath)
        
        if (parentPath) {
          setExpandedDirs(prev => new Set([...prev, parentPath]))
        }
        
        toast.success(`📄 Created ${newFile.name} (not committed)`, {
          description: 'Edit and commit when ready'
        })
      } catch (error) {
        console.error(`❌ Failed to add file:`, error)
      }
    }

    const handleFolderCreated = async (folderPath: string, parentPath: string) => {
      if (manuallyCreatedFilesRef.current.has(folderPath)) {
        console.log(`⏭️ Ignoring manually created: ${folderPath}`)
        return
      }
      if(useGitWorkspace.getState().isSwitchingBranch)return;
      
      console.log(`📁 [GITHUB] Folder created: ${folderPath}`)
      
      try {
        const gitkeepPath = `${folderPath}/.gitkeep`
        
        const newFile: GitHubFile = {
          name: '.gitkeep',
          path: gitkeepPath,
          sha: '',
          size: 0,
          type: 'file',
          content: '',
          url: '',
        }
        
        addFileToTree(newFile)
        
        setExpandedDirs(prev => new Set([...prev, parentPath, folderPath].filter(Boolean)))
        
        toast.success(`📁 Created ${folderPath.split('/').pop()}/ (not committed)`, {
          description: 'Commit when ready'
        })
      } catch (error) {
        console.error(`❌ Failed to create folder:`, error)
      }
    }
    
    const handleFileDeleted = async (filePath: string, parentPath: string) => {
      if (manuallyCreatedFilesRef.current.has(filePath)) return
      if(useGitWorkspace.getState().isSwitchingBranch)return;
      
      console.log(`🗑️ [GITHUB] File deleted: ${filePath}`)
      
      try {
        removeFileFromTree(filePath)
        markFileDeleted(filePath)
        
        if (activeFile?.path === filePath) {
          closeFile(filePath)
        }
        
        toast.info(`🗑️ Deleted ${filePath.split('/').pop()} (not committed)`, {
          description: 'Changes not committed to GitHub'
        })
      } catch (error) {
        console.error(`❌ Failed to delete file:`, error)
      }
    }
    
    const handleFolderDeleted = async (folderPath: string, parentPath: string) => {
      if (manuallyCreatedFilesRef.current.has(folderPath)) return
      if(useGitWorkspace.getState().isSwitchingBranch)return;
      
      console.log(`🗑️ [GITHUB] Folder deleted: ${folderPath}`)
      
      try {
        files
          .filter(f => f.path.startsWith(folderPath + '/') || f.path === folderPath)
          .forEach(f => {
            removeFileFromTree(f.path)
            markFileDeleted(f.path)
          })
        
        if (activeFile && activeFile.path.startsWith(folderPath + '/')) {
          closeFile(activeFile.path)
        }
        
        setExpandedDirs(prev => {
          const next = new Set(prev)
          next.delete(folderPath)
          Array.from(next).forEach(path => {
            if (path.startsWith(folderPath + '/')) next.delete(path)
          })
          return next
        })
        
        toast.info(`🗑️ Deleted ${folderPath.split('/').pop()}/ (not committed)`, {
          description: 'Changes not committed to GitHub'
        })
      } catch (error) {
        console.error(`❌ Failed to delete folder:`, error)
      }
    }
    
    const handleFileRenamed = async (oldPath: string, newPath: string, parentPath: string) => {
       if (manuallyCreatedFilesRef.current.has(newPath)) return
  if (useGitWorkspace.getState().isSwitchingBranch) return

  console.log(`✏️ [GITHUB] File renamed (treated as D+A): ${oldPath} → ${newPath}`)

  try {
    // --- 1. Handle the OLD path (delete) ---
    const oldFile = files.find(f => f.path === oldPath)

    if (oldFile) {
      removeFileFromTree(oldPath)

      if (!oldFile.sha) {
        // Local-only file: just untrack it, nothing to stage
        unmarkFileCreated(oldPath)
      } else {
        // GitHub file: stage for deletion
        markFileDeleted(oldPath)
      }

      if (activeFile?.path === oldPath) {
        closeFile(oldPath)
      }
    }

    // --- 2. Handle the NEW path (add) ---
    const content = await webContainerInstance.fs.readFile(`/${newPath}`, 'utf-8')

    const newFile: GitHubFile = {
      name: newPath.split('/').pop() || '',
      path: newPath,
      sha: '',           // brand new — not on GitHub yet
      size: content.length,
      type: 'file',
      content,
    }

    addFileToTree(newFile)
    markFileCreated(newPath)

    if (parentPath) {
      setExpandedDirs(prev => new Set([...prev, parentPath]))
    }

    toast.info(
      `${oldPath.split('/').pop()} → ${newPath.split('/').pop()}`,
      { description: 'Staged as D + A. Commit via Source Control.' }
    )
  } catch (error) {
    console.error(`❌ Failed to handle rename:`, error)
  }
    }
    
    fileCreationWatcher.initialize(
      webContainerInstance,
      handleFileCreated,
      handleFolderCreated,
      ['node_modules', '.git', '.next', 'dist', 'build', '.vercel'],
      {
        onFileDeleted: handleFileDeleted,
        onFolderDeleted: handleFolderDeleted,
        onFileRenamed: handleFileRenamed,
      }
    )
    
    return () => {
      console.log("🧹 [GITHUB] Cleaning up file watcher")
      fileCreationWatcher.stop()
    }
  }, [webContainerInstance, isReady, isWebContainerSupported, files, activeFile, addFileToTree, removeFileFromTree, markFileCreated, markFileDeleted, closeFile, openFileInWorkspace])

  return (
  <div className="flex h-screen overflow-hidden">
    <ResizablePanelGroup direction="horizontal" className="h-full">

      {/* ── Resizable sidebar ── */}
      {sidebarOpen && (
        <>
          <ResizablePanel
            defaultSize={18}
            minSize={14}
            maxSize={35}
            className="transition-all duration-200"
          >
            <div className="flex flex-col h-full border-r bg-muted/30">

              {/* Tab switcher */}
              <div className="flex shrink-0 border-b">
                <button
                  className={`flex-1 py-2 text-sm transition-colors ${
                    !showSourceControl
                      ? "bg-background border-b-2 border-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => setShowSourceControl(false)}
                >
                  Explorer
                </button>
                <button
                  className={`flex-1 py-2 text-sm transition-colors ${
                    showSourceControl
                      ? "bg-background border-b-2 border-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
              </div>

              {/* Scrollable content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {!showSourceControl ? (
                  <>
                    <div className="p-4 border-b space-y-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                        className="w-full justify-start"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                      </Button>

                      <div>
                        <h2 className="font-semibold">{repo}</h2>
                        <p className="text-xs text-muted-foreground">{owner}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <BranchSelector
                          owner={owner}
                          repo={repo}
                          currentBranch={currentBranch}
                          onBranchChange={handleBranchChange}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={loadRepositoryTree}
                          disabled={isLoadingTree}
                          className="h-6 w-6"
                        >
                          <RefreshCw className={`h-3 w-3 ${isLoadingTree ? "animate-spin" : ""}`} />
                        </Button>
                      </div>

                      {isWebContainerSupported && (
                        <div className="pt-2 border-t space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isServerRunning ? "bg-green-500" : "bg-gray-400"}`} />
                            <span className="text-xs font-medium">
                              {isServerRunning ? `${projectType} (Running)` : projectType || "Web Project"}
                            </span>
                          </div>
                          {isServerRunning && (
                            <>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={stopServer} className="flex-1">
                                  <Square className="h-3 w-3 mr-1" />
                                  Stop
                                </Button>
                                <Button size="sm" variant="outline" onClick={restartServer} className="flex-1">
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

                      {!isWebContainerSupported && !isLoadingTree && files.length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">Not a runnable web project</p>
                        </div>
                      )}
                    </div>

                    {isLoadingTree ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      <GitHubFileTree
                        files={files}
                        onFileSelect={handleFileSelect}
                        selectedPath={activeFile?.path}
                        onCreateFile={handleCreateFileClick}
                        onCreateFolder={handleCreateFolderClick}
                        onDeleteFile={handleDeleteFileClick}
                        onDeleteFolder={handleDeleteFolderClick}
                        expandedDirs={expandedDirs}
                        onExpandedDirsChange={setExpandedDirs}
                        modifiedFiles={modifiedFiles}
                        createdFiles={createdFiles}
                        deletedFiles={deletedFiles}
                        onRenameFile={handleRenameFile}
                      />
                    )}
                  </>
                ) : (
                  <SourceControlPanel
                    onCommit={handleCommit}
                    onViewDiff={(filePath) => {
                      const file = files.find((f) => f.path === filePath)
                      if (file) openFileInWorkspace(file)
                      setDiffFilePath(filePath)
                      setShowDiff(true)
                    }}
                    isCommitting={isSaving}
                  />
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />
        </>
      )}

      {/* ── Editor + Preview ── */}
      <ResizablePanel defaultSize={82}>
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={showPreview ? 50 : 100} minSize={30}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="h-16 shrink-0 border-b flex items-center justify-between px-4 bg-background">
                <div className="flex items-center gap-3">
                  {activeFile && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {activeFile.path.split("/").pop()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {activeFile.path}
                        </span>
                      </div>
                      {activeFile.hasChanges && (
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <span className="h-2 w-2 rounded-full bg-orange-500" />
                          <span>Modified</span>
                        </div>
                      )}
                    </>
                  )}
                  {changeCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-blue-600">
                      <span className="px-2 py-1 rounded-full bg-blue-100">
                        {changeCount} change{changeCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Editor */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {isLoadingFile ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : showDiff && diffFilePath ? (
                  <DiffViewer
                    originalContent={remoteState.get(diffFilePath) ?? ''}
                    modifiedContent={openFiles.find(f => f.path === diffFilePath)?.content ?? remoteState.get(diffFilePath) ?? ''}
                    filepath={diffFilePath}
                    onClose={() => { setShowDiff(false); setDiffFilePath(null) }}
                  />
                ) : activeFile ? (
                  <PlaygroundEditor
                    activeFile={{
                      filename: activeFile.path.split("/").pop()?.split(".")[0] || "file",
                      fileExtension: activeFile.path.split(".").pop() || "txt",
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
                    <p className="text-lg">Select a file to start editing</p>
                    <p className="text-sm mt-2">Changes will be committed to {currentBranch}</p>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          {isWebContainerSupported && showPreview && (
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
                    console.log("📡 Terminal detected server URL:", url)
                  }}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ResizablePanel>

    </ResizablePanelGroup>

    {/* Dialogs — unchanged */}
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
      {/* ... your existing delete file dialog content ... */}
    </AlertDialog>
    <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
      {/* ... your existing delete folder dialog content ... */}
    </AlertDialog>
  </div>
)
}