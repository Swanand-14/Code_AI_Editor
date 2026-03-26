"use client"

import { useState } from "react"
import { 
  GitCommit, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Plus, 
  Minus,
  RotateCcw,
  FileText,
  FileCode,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGitWorkspace, useChangeCount, useStagedCount } from "../hooks/Usegitworkspace"
import { toast } from "sonner"

interface SourceControlPanelProps {
  onCommit: (message: string, description?: string) => Promise<void>
  onViewDiff: (filePath: string) => void
  onDiscardFile?: (filePath: string) => void
  isCommitting?: boolean
}

export function SourceControlPanel({ 
  onCommit, 
  onViewDiff,
  onDiscardFile,
  isCommitting = false 
}: SourceControlPanelProps) {
  const [commitMessage, setCommitMessage] = useState("")
  const [commitDescription, setCommitDescription] = useState("")
  const [showDescription, setShowDescription] = useState(false)
  const [changesExpanded, setChangesExpanded] = useState(true)
  const [stagedExpanded, setStagedExpanded] = useState(true)

  const {
    modifiedFiles,
    createdFiles,
    deletedFiles,
    stagedFiles,
    stageFile,
    unstageFile,
    stageAllFiles,
    unstageAllFiles,
    discardFileChanges,
    files,
  } = useGitWorkspace()

  const totalChanges = useChangeCount()
  const totalStaged = useStagedCount()

  // Get all changed files
  const changedFiles = [
    ...Array.from(modifiedFiles).map(path => ({ path, type: 'M' as const })),
    ...Array.from(createdFiles).map(path => ({ path, type: 'U' as const })),
    ...Array.from(deletedFiles).map(path => ({ path, type: 'D' as const })),
  ]

  // Separate into staged and unstaged
  const unstagedFiles = changedFiles.filter(f => !stagedFiles.has(f.path))
  const stagedFilesList = changedFiles.filter(f => stagedFiles.has(f.path))

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      toast.error("Please enter a commit message")
      return
    }

    if (totalStaged === 0) {
      toast.error("No files staged for commit")
      return
    }

    await onCommit(commitMessage, commitDescription || undefined)
    
    // Clear form
    setCommitMessage("")
    setCommitDescription("")
    setShowDescription(false)
  }

  const getBadgeIcon = (type: 'M' | 'U' | 'D') => {
    switch (type) {
      case 'M': return <span className="text-orange-500">M</span>
      case 'U': return <span className="text-green-500">U</span>
      case 'D': return <span className="text-red-500">D</span>
    }
  }

  const getFileIcon = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
      return <FileCode className="h-4 w-4 text-blue-500" />
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />
  }

  const getFileName = (path: string) => {
    const parts = path.split('/')
    const fileName = parts.pop() || path
    const directory = parts.length > 0 ? parts.join('/') : ''
    return { fileName, directory }
  }

  const commitLabel = () => {
    if(totalStaged>0)return `Commit ${totalStaged} staged`
    if(totalChanges>0)return `Commit All (${totalChanges})`
    return "Commit"
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitCommit className="h-5 w-5" />
          SOURCE CONTROL
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Commit Message Input */}
          <div className="space-y-2">
            <Input
              placeholder="Message (⌘Enter to commit...)"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleCommit()
                }
              }}
              className="font-mono text-sm"
            />
            
            {showDescription && (
              <Textarea
                placeholder="Description (optional)"
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                className="font-mono text-sm min-h-[60px]"
                rows={3}
              />
            )}
            
            {!showDescription && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDescription(true)}
                className="text-xs"
              >
                Add description
              </Button>
            )}
          </div>

          {/* Commit Button */}
          <Button
            onClick={handleCommit}
            disabled={isCommitting || !commitMessage.trim() || totalChanges === 0}
            className="w-full"
          >
            {isCommitting ? (
              <>
                <span className="h-3.5 w-3.5 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Committing...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 mr-2" />
                {commitLabel()}
              </>
            )}
          </Button>

          {/* Changes Section */}
          <div className="space-y-1">
            <div
              className="flex items-center justify-between py-2 cursor-pointer hover:bg-muted/50 rounded px-2"
              onClick={() => setChangesExpanded(!changesExpanded)}
            >
              <div className="flex items-center gap-2">
                {changesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium text-sm">
                  Changes ({unstagedFiles.length})
                </span>
              </div>
              
              {unstagedFiles.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    stageAllFiles()
                  }}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Stage All
                </Button>
              )}
            </div>

            {changesExpanded && unstagedFiles.length === 0 && (
              <div className="text-sm text-muted-foreground pl-8 py-2">
                No changes
              </div>
            )}

            {changesExpanded && unstagedFiles.map(({ path, type }) => {
              const { fileName, directory } = getFileName(path)
              
              return (
                <div
                  key={path}
                  className="group flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stageFile(path)}
                    className="h-6 w-6 p-0"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  
                  <div 
                    className="flex-1 flex items-center gap-2 min-w-0"
                    onClick={() => onViewDiff(path)}
                  >
                    {getFileIcon(path)}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{fileName}</div>
                      {directory && (
                        <div className="text-xs text-muted-foreground truncate">
                          {directory}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {getBadgeIcon(type)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDiscardFile?onDiscardFile(path) :discardFileChanges(path)
                        
                      }}
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Staged Changes Section */}
          <div className="space-y-1">
            <div
              className="flex items-center justify-between py-2 cursor-pointer hover:bg-muted/50 rounded px-2"
              onClick={() => setStagedExpanded(!stagedExpanded)}
            >
              <div className="flex items-center gap-2">
                {stagedExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium text-sm">
                  Staged Changes ({stagedFilesList.length})
                </span>
              </div>
              
              {stagedFilesList.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    unstageAllFiles()
                  }}
                  className="h-7 text-xs"
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Unstage All
                </Button>
              )}
            </div>

            {stagedExpanded && stagedFilesList.length === 0 && (
              <div className="text-sm text-muted-foreground pl-8 py-2">
                No staged changes
              </div>
            )}

            {stagedExpanded && stagedFilesList.map(({ path, type }) => {
              const { fileName, directory } = getFileName(path)
              
              return (
                <div
                  key={path}
                  className="group flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unstageFile(path)}
                    className="h-6 w-6 p-0"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  
                  <div 
                    className="flex-1 flex items-center gap-2 min-w-0"
                    onClick={() => onViewDiff(path)}
                  >
                    {getFileIcon(path)}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{fileName}</div>
                      {directory && (
                        <div className="text-xs text-muted-foreground truncate">
                          {directory}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {getBadgeIcon(type)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}