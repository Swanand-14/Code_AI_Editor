"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchRepositoryTree, fetchFileContent, saveFileToGitHub } from "../actions"
import { GitHubFileTree } from "./github-file-tree"
import { BranchSelector } from "./branch-selector"
import PlaygroundEditor from "@/modules/playground/components/playgroundEditor"
import { Button } from "@/components/ui/button"
import { Save, GitCommit, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface GitHubFile {
  name: string
  path: string
  sha: string
  size: number
  type: "file" | "dir"
  content?: string
}

interface OpenFile {
  path: string
  content: string
  originalContent: string
  sha: string
  hasChanges: boolean
}

export default function GitHubPlayground({ repoFullName }: { repoFullName: string }) {
  const [owner, repo] = repoFullName.split("/")
  const [currentBranch, setCurrentBranch] = useState("main")
  const [files, setFiles] = useState<GitHubFile[]>([])
  const [openFile, setOpenFile] = useState<OpenFile | null>(null)
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [commitDescription, setCommitDescription] = useState("")

  useEffect(() => {
    loadRepositoryTree()
  }, [currentBranch])

  async function loadRepositoryTree() {
    setIsLoadingTree(true)
    const result = await fetchRepositoryTree(owner, repo, currentBranch)
    
    if (result.success) {
      setFiles(result.data)
    } else {
      toast.error(result.error || "Failed to load repository")
    }
    
    setIsLoadingTree(false)
  }

  function handleBranchChange(branch: string) {
    // Close current file when switching branches
    setOpenFile(null)
    setCurrentBranch(branch)
    toast.success(`Switched to ${branch}`)
  }

  async function handleFileSelect(file: GitHubFile) {
    if (file.type === "dir") return

    // Warn if there are unsaved changes
    if (openFile?.hasChanges) {
      const confirm = window.confirm(
        "You have unsaved changes. Are you sure you want to switch files?"
      )
      if (!confirm) return
    }

    setIsLoadingFile(true)
    const result = await fetchFileContent(owner, repo, file.path, currentBranch)
    
    if (result.success) {
      setOpenFile({
        path: file.path,
        content: result.data,
        originalContent: result.data,
        sha: file.sha,
        hasChanges: false,
      })
    } else {
      toast.error(result.error || "Failed to load file")
    }
    
    setIsLoadingFile(false)
  }

  function handleContentChange(newContent: string) {
    if (!openFile) return
    
    setOpenFile({
      ...openFile,
      content: newContent,
      hasChanges: newContent !== openFile.originalContent,
    })
  }

  async function handleSave() {
    if (!openFile || !openFile.hasChanges) return
    setCommitDialogOpen(true)
  }

  async function handleCommit() {
    if (!openFile || !commitMessage.trim()) {
      toast.error("Please enter a commit message")
      return
    }

    setIsSaving(true)
    
    const fullMessage = commitDescription 
      ? `${commitMessage}\n\n${commitDescription}`
      : commitMessage

    const result = await saveFileToGitHub(
      owner,
      repo,
      openFile.path,
      openFile.content,
      fullMessage,
      openFile.sha,
      currentBranch
    )
    
    if (result.success) {
      toast.success("Changes committed successfully")
      setOpenFile({
        ...openFile,
        originalContent: openFile.content,
        sha: result.data.content.sha,
        hasChanges: false,
      })
      setCommitMessage("")
      setCommitDescription("")
      setCommitDialogOpen(false)
      
      // Reload tree to update SHAs
      await loadRepositoryTree()
    } else {
      toast.error(result.error || "Failed to commit changes")
    }
    
    setIsSaving(false)
  }

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        if (openFile?.hasChanges) {
          handleSave()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [openFile])

  return (
    <div className="flex h-screen">
      {/* File Tree Sidebar */}
      <div className="w-64 border-r bg-muted/30 overflow-auto flex flex-col">
        <div className="p-4 border-b space-y-3">
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
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingTree ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          {isLoadingTree ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <GitHubFileTree
              files={files}
              onFileSelect={handleFileSelect}
              selectedPath={openFile?.path}
            />
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b flex items-center justify-between px-4 bg-background">
          <div className="flex items-center gap-3">
            {openFile && (
              <>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {openFile.path.split("/").pop()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {openFile.path}
                  </span>
                </div>
                {openFile.hasChanges && (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                    <span>Unsaved</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {openFile?.hasChanges && (
              <>
                <Button
                  onClick={() => {
                    if (window.confirm("Discard all changes?")) {
                      setOpenFile({
                        ...openFile,
                        content: openFile.originalContent,
                        hasChanges: false,
                      })
                    }
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Discard
                </Button>
                <Button onClick={handleSave} size="sm" disabled={isSaving}>
                  <GitCommit className="h-4 w-4 mr-2" />
                  Commit Changes
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {isLoadingFile ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : openFile ? (
            <PlaygroundEditor
              activeFile={{
                filename: openFile.path.split("/").pop()?.split(".")[0] || "file",
                fileExtension: openFile.path.split(".").pop() || "txt",
                content: openFile.content,
              }}
              content={openFile.content}
              onContentChange={handleContentChange}
              suggestionLoading={false}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="text-lg">Select a file to start editing</p>
              <p className="text-sm mt-2">Changes will be committed to {currentBranch}</p>
            </div>
          )}
        </div>
      </div>

      {/* Commit Dialog */}
      <Dialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit Changes</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">File</label>
              <p className="text-sm text-muted-foreground mt-1">{openFile?.path}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Branch</label>
              <p className="text-sm text-muted-foreground mt-1">{currentBranch}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Commit Message *</label>
              <Input
                placeholder="Update code..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="Add more details about your changes..."
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCommitDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleCommit} disabled={isSaving || !commitMessage.trim()}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Committing...
                  </>
                ) : (
                  <>
                    <GitCommit className="h-4 w-4 mr-2" />
                    Commit to {currentBranch}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}