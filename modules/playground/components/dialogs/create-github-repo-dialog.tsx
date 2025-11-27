"use client"

import { useState } from "react"
import { Loader2, Github, Lock, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { sanitizeRepoName, validateRepoName } from "@/modules/playground/lib/template-to-files"

interface CreateGitHubRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateRepo: (repoData: RepoCreationData) => Promise<void>
  playGroundName?: string // Make it optional with ?
}

export interface RepoCreationData {
  name: string
  description: string
  isPrivate: boolean
  initializeWithReadme: boolean
  addGitignore: boolean
}

export function CreateGithubRepoDialog({
  open,
  onOpenChange,
  onCreateRepo,
  playGroundName,
}: CreateGitHubRepoDialogProps) {
  const [isCreating, setIsCreating] = useState(false)
  
  // Use sanitizeRepoName helper with fallback
  const [repoName, setRepoName] = useState(
    sanitizeRepoName(playGroundName || "my-playground")
  )
  
  const [description, setDescription] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [initializeWithReadme, setInitializeWithReadme] = useState(true)
  const [addGitignore, setAddGitignore] = useState(true)
  const [nameError, setNameError] = useState<string>("")

  // Validate name when it changes
  const handleNameChange = (value: string) => {
    setRepoName(value)
    const validation = validateRepoName(value)
    setNameError(validation.valid ? "" : validation.error || "")
  }

  const handleCreate = async () => {
    // Validate before submitting
    const validation = validateRepoName(repoName)
    if (!validation.valid) {
      setNameError(validation.error || "Invalid repository name")
      return
    }

    setIsCreating(true)
    try {
      await onCreateRepo({
        name: repoName,
        description,
        isPrivate,
        initializeWithReadme,
        addGitignore,
      })
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create a repo", error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Create GitHub Repository
          </DialogTitle>
          <DialogDescription>
            Push your playground to GitHub and continue editing there
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Repository Name */}
          <div className="space-y-2">
            <Label htmlFor="repo-name">
              Repository Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="repo-name"
              placeholder="my-awesome-project"
              value={repoName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isCreating}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError ? (
              <p className="text-xs text-red-500">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Use lowercase letters, numbers, hyphens, and periods
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="A brief description of your project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCreating}
              rows={3}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <RadioGroup
              value={isPrivate ? "private" : "public"}
              onValueChange={(value) => setIsPrivate(value === "private")}
              disabled={isCreating}
            >
              <div className="flex items-center space-x-2 border rounded-lg p-3">
                <RadioGroupItem value="public" id="public" />
                <Label htmlFor="public" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-4 w-4" />
                    <span className="font-medium">Public</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anyone can see this repository
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-2 border rounded-lg p-3">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span className="font-medium">Private</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only you can see this repository
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Additional Options */}
          <div className="space-y-3">
            <Label>Initialize with:</Label>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="readme"
                checked={initializeWithReadme}
                onCheckedChange={(checked) =>
                  setInitializeWithReadme(checked as boolean)
                }
                disabled={isCreating}
              />
              <Label
                htmlFor="readme"
                className="text-sm font-normal cursor-pointer"
              >
                Add a README file
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="gitignore"
                checked={addGitignore}
                onCheckedChange={(checked) => setAddGitignore(checked as boolean)}
                disabled={isCreating}
              />
              <Label
                htmlFor="gitignore"
                className="text-sm font-normal cursor-pointer"
              >
                Add .gitignore
              </Label>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>What happens next:</strong>
              <br />
              1. A new repository will be created in your GitHub account
              <br />
              2. All your playground files will be pushed as the initial commit
              <br />
              3. You'll be redirected to the GitHub playground to continue editing
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!repoName.trim() || !!nameError || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Github className="h-4 w-4 mr-2" />
                Create Repository
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}