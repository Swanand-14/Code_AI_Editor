"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GitBranch, Plus, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

interface branch {
    name:string
    commit:{
        sha:string
        url:string
    }
    protected:boolean
}

interface BranchSelectorProps{
    owner:string
    repo:string
    currentBranch:string
    onBranchChange:(branch:string)=>void
}

export function BranchSelector({owner,repo,currentBranch,onBranchChange}:BranchSelectorProps){
    const [branches,setBranches] = useState<branch[]>([])
    const [isLoading,setIsloading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
useEffect(() => {
    loadBranches()
  }, [owner, repo])

  async function loadBranches(){
    setIsloading(true);
    try {
        const response = await fetch(`/api/github/branches?owner=${owner}&repo=${repo}`)
        if(response.ok){
            const data = await response.json()
            setBranches(data)
        }
    } catch (error) {
        toast.error("Failed to load branches")
        
    }
    setIsloading(false)

  }

  async function createBranch(){
    if(!newBranchName.trim()){
        toast.error("Please enter a branch name")
        return
    }
    setIsCreating(true)
    try {
        const response = await fetch(`/api/github/branches`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                owner,
                repo,
                newBranch:newBranchName,
                fromBranch:currentBranch
            }),
        }
    
    )

    if(response.ok){
        toast.success(`Branch ${newBranchName} created`)
        setShowCreateDialog(false)
        setNewBranchName("")
        await loadBranches()
        onBranchChange(newBranchName)

    }else{
        toast.error("Failed to create branch")
    }
    } catch (error) {
        toast.error("Failed to create branch")
        
    }

    setIsCreating(false)
  }

   return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4 mr-2" />
            )}
            {currentBranch}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.name}
              onClick={() => onBranchChange(branch.name)}
              className={currentBranch === branch.name ? "bg-accent" : ""}
            >
              <GitBranch className="h-4 w-4 mr-2" />
              {branch.name}
              {branch.protected && (
                <span className="ml-auto text-xs text-muted-foreground">Protected</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create new branch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Branch Name</label>
              <Input
                placeholder="feature/my-feature"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Will be created from: {currentBranch}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createBranch} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Branch"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )

}