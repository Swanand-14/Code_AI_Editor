"use client"

import { Button } from "@/components/ui/button"
import { ArrowDown } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RepositoryBrowser } from "@/modules/github/components/respository-browser"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { signIn } from "next-auth/react"

const AddRepo = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { data: session, status } = useSession()

  const handleClick = async () => {
    // Check if user is authenticated
    if (status === "loading") {
      toast.info("Loading...")
      return
    }

    if (!session) {
      toast.error("Please sign in first")
      // Optionally redirect to sign in
      signIn()
      return
    }

    // Try to open the dialog - the RepositoryBrowser will handle GitHub connection check
    setIsDialogOpen(true)
  }

  return (
    <>
      <div
        onClick={handleClick}
        className="group px-6 py-6 flex flex-row justify-between items-center border rounded-lg bg-muted cursor-pointer 
        transition-all duration-300 ease-in-out
        hover:bg-background hover:border-[#E93F3F] hover:scale-[1.02]
        shadow-[0_2px_10px_rgba(0,0,0,0.08)]
        hover:shadow-[0_10px_30px_rgba(233,63,63,0.15)]"
      >
        <div className="flex flex-row justify-center items-start gap-4">
          <Button
            variant={"outline"}
            className="flex justify-center items-center bg-white group-hover:bg-[#fff8f8] group-hover:border-[#E93F3F] group-hover:text-[#E93F3F] transition-colors duration-300"
            size={"icon"}
          >
            <ArrowDown size={30} className="transition-transform duration-300 group-hover:translate-y-1" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#e93f3f]">Open Github Repository</h1>
            <p className="text-sm text-muted-foreground max-w-[220px]">
              Work with your repositories in our editor
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <Image
            src={"/github.svg"}
            alt="Open GitHub repository"
            width={150}
            height={150}
            className="transition-transform duration-300 group-hover:scale-110"
          />
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select a Repository</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <RepositoryBrowser />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AddRepo