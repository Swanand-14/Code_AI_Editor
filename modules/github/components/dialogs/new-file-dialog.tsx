"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface NewFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateFile: (path: string, filename: string) => Promise<void>
  currentPath?: string
}

export function NewFileDialog({ open, onOpenChange, onCreateFile, currentPath = "" }: NewFileDialogProps) {
  const [filename, setFilename] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    if (!filename.trim()) {
      setError("Filename is required")
      return
    }

    // Basic validation
    if (filename.includes("/") || filename.includes("\\")) {
      setError("Filename cannot contain slashes")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      await onCreateFile(currentPath, filename)
      setFilename("")
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to create file")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {currentPath && (
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <p className="text-sm">{currentPath || "/"}</p>
            </div>
          )}

          <div>
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              placeholder="example.tsx"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value)
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !filename.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create File"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}