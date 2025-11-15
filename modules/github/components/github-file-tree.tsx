"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react"
import { cn } from "@/lib/utils"

interface GitHubFile {
  name: string
  path: string
  type: "file" | "dir"
}

interface FileTreeProps {
  files: GitHubFile[]
  onFileSelect: (file: GitHubFile) => void
  selectedPath?: string
}

export function GitHubFileTree({ files, onFileSelect, selectedPath }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]))

  // Build tree structure
  const tree = buildTree(files)

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
    const files = node.files

    return (
      <>
        {dirs.map(([name, child]: [string, any]) => {
          const fullPath = currentPath ? `${currentPath}/${name}` : name
          const isExpanded = expandedDirs.has(fullPath)

          return (
            <div key={fullPath}>
              <div
                className="flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm"
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
              
              {isExpanded && renderTree(child, fullPath, level + 1)}
            </div>
          )
        })}

        {files.map((file: GitHubFile) => (
          <div
            key={file.path}
            className={cn(
              "flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm",
              selectedPath === file.path && "bg-accent"
            )}
            style={{ paddingLeft: `${level * 12 + 20}px` }}
            onClick={() => onFileSelect(file)}
          >
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </div>
        ))}
      </>
    )
  }

  return <div className="py-2">{renderTree(tree)}</div>
}