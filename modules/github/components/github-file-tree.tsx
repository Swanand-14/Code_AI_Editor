"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, File, Folder, Plus, FilePlus, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface GitHubFile {
  name: string
  path: string
  sha: string
  type: "file" | "dir"
}

interface FileTreeProps {
  files: GitHubFile[]
  onFileSelect: (file: GitHubFile) => void
  selectedPath?: string
  onCreateFile?: (path: string) => void
  onCreateFolder?: (path: string) => void
  onDeleteFile?: (file: GitHubFile) => void
  onDeleteFolder?: (folderPath: string, folderName: string) => void 
  expandedDirs?: Set<string> 
  onExpandedDirsChange?: (dirs: Set<string>) => void 
}

export function GitHubFileTree({ 
  files, 
  onFileSelect, 
  selectedPath,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder ,
  expandedDirs: controlledExpandedDirs, 
  onExpandedDirsChange 
}: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]))

  // Build tree structure from flat file list
  function buildTree(files: GitHubFile[]) {
    const root: any = { name: "", children: {}, files: [] }

    files.forEach((file) => {
      const parts = file.path.split("/")
      let current = root

      parts.forEach((part, index) => {
        if (index === parts.length - 1 && file.type === "file") {
          current.files.push(file)
        } else {
          if (!current.children[part]) {
            current.children[part] = { name: part, children: {}, files: [] }
          }
          current = current.children[part]
        }
      })
    })

    return root
  }

  const tree = buildTree(files)

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function renderTree(node: any, currentPath: string = "", level: number = 0) {
    const dirs = Object.entries(node.children)
    const nodeFiles = node.files

    return (
      <>
        {dirs.map(([name, child]: [string, any]) => {
          const fullPath = currentPath ? `${currentPath}/${name}` : name
          const isExpanded = expandedDirs.has(fullPath)

          return (
            <div key={fullPath}>
              <div className="flex items-center group">
                <div
                  className="flex-1 flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm"
                  style={{ paddingLeft: `${level * 12 + 8}px` }}
                  onClick={() => toggleDir(fullPath)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="truncate">{name}</span>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onCreateFile && (
                      <DropdownMenuItem onClick={() => onCreateFile(fullPath)}>
                        <FilePlus className="h-4 w-4 mr-2" />
                        New File
                      </DropdownMenuItem>
                    )}
                    {onCreateFolder && (
                      <DropdownMenuItem onClick={() => onCreateFolder(fullPath)}>
                        <FolderPlus className="h-4 w-4 mr-2" />
                        New Folder
                      </DropdownMenuItem>
                    )}
                   
                    {onDeleteFolder && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => onDeleteFolder(fullPath, name)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Folder
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              {isExpanded && renderTree(child, fullPath, level + 1)}
            </div>
          )
        })}

        {nodeFiles.map((file: GitHubFile) => (
          <div key={file.path} className="flex items-center group">
            <div
              className={cn(
                "flex-1 flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm",
                selectedPath === file.path && "bg-accent"
              )}
              style={{ paddingLeft: `${level * 12 + 20}px` }}
              onClick={() => onFileSelect(file)}
            >
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.name}</span>
            </div>

            {onDeleteFile && file.name !== ".gitkeep" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => onDeleteFile(file)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="py-2">
      {/* Root level actions */}
      {(onCreateFile || onCreateFolder) && (
        <div className="px-2 pb-2 border-b mb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {onCreateFile && (
                <DropdownMenuItem onClick={() => onCreateFile("")}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  New File
                </DropdownMenuItem>
              )}
              {onCreateFolder && (
                <DropdownMenuItem onClick={() => onCreateFolder("")}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      
      {renderTree(tree)}
    </div>
  )
}