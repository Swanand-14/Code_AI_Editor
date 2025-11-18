"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface NewFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateFolder: (path: string, folderName: string) => Promise<void>
  currentPath?: string
}

export function NewFolderDialog({ open, onOpenChange, onCreateFolder, currentPath = "" }: NewFolderDialogProps) {
  const [folderName, setFolderName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    if (!folderName.trim()) {
      setError("Folder name is required")
      return
    }

    // Basic validation
    if (folderName.includes("/") || folderName.includes("\\")) {
      setError("Folder name cannot contain slashes")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      await onCreateFolder(currentPath, folderName)
      setFolderName("")
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to create folder")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {currentPath && (
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <p className="text-sm">{currentPath || "/"}</p>
            </div>
          )}

          <div>
            <Label htmlFor="folderName">Folder Name</Label>
            <Input
              id="folderName"
              placeholder="components"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value)
                setError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  handleCreate()
                }
              }}
              className="mt-1"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              A .gitkeep file will be created to track this folder
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !folderName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Folder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}