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
import type { CollabSessionResponse } from "@/modules/collaboration/types";
import { createCollabWorkspace } from "@/modules/collaboration/workspaces/actions";
interface StartGitHubCollabButtonProps {
  repoFullName: string;
  repoId: number;
  defaultBranch: string;
  repoName: string;
}


export function StartGitHubCollabButton({
  repoFullName,
  repoId,
  defaultBranch,
  repoName,
}: StartGitHubCollabButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);

  const handleStartCollab = async () => {
    setIsLoading(true);
    try {
      console.log("🚀 Starting GitHub collaboration for:", repoFullName);

      // Parse repo owner and name
      const [repoOwner, repo] = repoFullName.split("/");

      // 1. Create CollabSession
      const sessionResponse = await fetch("/api/collab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectType: "github",
          repoOwner,
          repoName: repo,
          branch: defaultBranch,
        }),
      });

      const sessionData: CollabSessionResponse = await sessionResponse.json();

      if (!sessionData.success) {
        toast.error(sessionData.error || "Failed to create session");
        return;
      }

      console.log("✅ GitHub session created:", sessionData.sessionId);

      // 2. Create empty workspace (files will be loaded in Phase 2)
      const workspaceResult = await createCollabWorkspace({
        sessionId: sessionData.sessionId!,
        name: `${repoName} (Collaboration)`,
        templateData: {
          folderName: repoName,
          items: [], // 🔥 Empty for Phase 1
        },
      });

      if (!workspaceResult.success) {
        toast.error(workspaceResult.error || "Failed to create workspace");
        return;
      }

      console.log("✅ GitHub workspace created:", workspaceResult.workSpaceId);

      setShareUrl(sessionData.shareUrl!);
      setIsOpen(true);
      toast.success("GitHub collaboration session created!");
    } catch (error) {
      console.error("❌ Error:", error);
      toast.error("Failed to start collaboration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleStartCollab}
        disabled={isLoading}
      >
        <Users className="h-4 w-4 mr-2" />
        {isLoading ? "Creating..." : "Start Collaboration"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>GitHub Collaboration Session Created</DialogTitle>
            <DialogDescription>
              Share this link to collaborate on {repoFullName}
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
              <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(shareUrl, "_blank")}
                className="flex-1"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button variant="default" size="sm" onClick={() => setIsOpen(false)} className="flex-1">
                Done
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Session expires in 24 hours
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}