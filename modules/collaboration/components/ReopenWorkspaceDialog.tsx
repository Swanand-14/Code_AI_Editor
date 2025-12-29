"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, Users, Loader2 } from "lucide-react";

interface ReopenWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: {
    id: string;
    name: string;
    sessionId: string;
    fileCount: number;
  };
}

export function ReopenWorkspaceDialog({
  open,
  onOpenChange,
  workspace,
}: ReopenWorkspaceDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenSolo = () => {
    setIsLoading(true);
    // TODO: Implement solo playground mode
    // For now, just redirect to collab page
    router.push(`/collab/${workspace.sessionId}`);
  };

  const handleStartNewCollab = () => {
    setIsLoading(true);
    router.push(`/collab/${workspace.sessionId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open "{workspace.name}"</DialogTitle>
          <DialogDescription>
            Choose how you'd like to open this workspace
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-4">
          {/* Solo Mode Option */}
          <Button
            variant="outline"
            className="h-auto flex-col items-start p-4 hover:bg-muted"
            onClick={handleOpenSolo}
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen className="h-5 w-5" />
              <span className="font-semibold">Open Solo</span>
            </div>
            <p className="text-xs text-muted-foreground text-left">
              Work on your files privately without real-time collaboration
            </p>
          </Button>

          {/* Collab Mode Option */}
          <Button
            variant="outline"
            className="h-auto flex-col items-start p-4 hover:bg-orange-50 dark:hover:bg-orange-950 border-orange-200"
            onClick={handleStartNewCollab}
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-orange-500" />
              <span className="font-semibold">Start New Collab Session</span>
            </div>
            <p className="text-xs text-muted-foreground text-left">
              Create a new collaboration link and work with others in real-time
            </p>
          </Button>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              📊 <strong>Workspace Info:</strong> {workspace.fileCount} files •
              Last saved workspace state will be loaded
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}