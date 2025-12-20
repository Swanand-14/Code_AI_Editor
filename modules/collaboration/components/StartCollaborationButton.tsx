"use client";
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, Copy, Check, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { CollabSessionResponse } from "../types";

interface StartCollabButtonProps {
  playgroundId: string;
  playgroundName?: string;
}

export function StartCollabButton({playgroundId,playgroundName}:StartCollabButtonProps){
    const [isOpen,setIsOpen] = useState(false);
    const [isLoading,setIsLoading] = useState(false)
    const [shareUrl,setShareUrl] = useState<string>("");
    const [isCopied,setIsCopied] = useState(false);

    const handleStartCollab = async() => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/collab/session",
                {
                    method:"POST",
                    headers:{"Content-Type":"application/json"},
                    body:JSON.stringify({
                        projectType:"starter",
                        playgroundId
                    })
                }
            )
            const data:CollabSessionResponse = await response.json()
            if(!data.success){
                toast.error(data.error || "Failed to create collaboration session")
                return;
            }
            setShareUrl(data.shareUrl!);
            setIsOpen(true);
            toast.success("Collaboration session created!");

        } catch (error) {
            console.error("Error starting collaboration:",error)
            toast.error("Failed to start collaboration")

        }finally{
            setIsLoading(false)
        }
    }

    const handleCopyUrl = async() => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setIsCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(()=>setIsCopied(false),2000)

        } catch (error) {
            toast.error("Failed to copy Link")
            
        }
    }

    const handleOpenInNewTab = () => {
        window.open(shareUrl,"_blank");
    };

     return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleStartCollab}
        disabled={isLoading}
        aria-label="Start collaboration"
      >
        <Users className="h-4 w-4 mr-2" />
        {isLoading ? "Creating..." : "Start Collaboration"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Collaboration Session Created</DialogTitle>
            <DialogDescription>
              Share this link with others to collaborate on{" "}
              {playgroundName || "this playground"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyUrl}
                className="shrink-0"
              >
                {isCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenInNewTab}
                className="flex-1"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="flex-1"
              >
                Done
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              This session will expire in 24 hours
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}