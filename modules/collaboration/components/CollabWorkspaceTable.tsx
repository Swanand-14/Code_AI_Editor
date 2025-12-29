"use client";

import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  MoreHorizontal,
  Edit3,
  Trash2,
  ExternalLink,
  Copy,
  FolderOpen,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { deleteCollabWorkspace } from "../workspaces/actions";
import { ReopenWorkspaceDialog } from "./ReopenWorkspaceDialog";

interface CollabWorkspace {
  id: string;
  name: string;
  sessionId: string;
  filesJson: any;
  originalTemplateName?: string;
  fileCount: number;
  totalSize: number;
  lastSavedAt: Date;
  createdAt: Date;
  owner: {
    id: string;
    name: string;
    image?: string;
  };
}

interface CollabWorkspaceTableProps {
  workspaces: CollabWorkspace[];
}

export default function CollabWorkspaceTable({
  workspaces,
}: CollabWorkspaceTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<CollabWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteClick = (workspace: CollabWorkspace) => {
    setSelectedWorkspace(workspace);
    setDeleteDialogOpen(true);
  };

  const handleReopenClick = (workspace: CollabWorkspace) => {
    setSelectedWorkspace(workspace);
    setReopenDialogOpen(true);
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) return;
    setIsLoading(true);

    try {
      const result = await deleteCollabWorkspace(selectedWorkspace.sessionId);
      if (result.success) {
        setDeleteDialogOpen(false);
        toast.success("Workspace deleted successfully");
        window.location.reload(); // Refresh to update list
      } else {
        toast.error(result.error || "Failed to delete workspace");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error("Delete error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyCollabUrl = (sessionId: string) => {
    const url = `${window.location.origin}/collab/${sessionId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Collaboration URL copied!");
      })
      .catch((err) => {
        toast.error("Failed to copy URL");
        console.error("Error copying URL:", err);
      });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Files</TableHead>
              <TableHead>Last Saved</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspaces.map((workspace) => (
              <TableRow key={workspace.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold">{workspace.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Session: {workspace.sessionId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="bg-orange-500/10 text-orange-600 border-orange-500"
                  >
                    {workspace.originalTemplateName || "Custom"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col text-sm">
                    <span>{workspace.fileCount} files</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(workspace.totalSize)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(workspace.lastSavedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden">
                      <Image
                        src={workspace.owner.image || "/placeholder.svg"}
                        alt={workspace.owner.name}
                        width={32}
                        height={32}
                        className="object-cover"
                      />
                    </div>
                    <span className="text-sm">{workspace.owner.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => handleReopenClick(workspace)}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Open Workspace
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => copyCollabUrl(workspace.sessionId)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Collab Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(workspace)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Workspace
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedWorkspace?.name}"? This
              will permanently remove all saved files and collaboration history.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkspace}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : "Delete Workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Workspace Dialog */}
      {selectedWorkspace && (
        <ReopenWorkspaceDialog
          open={reopenDialogOpen}
          onOpenChange={setReopenDialogOpen}
          workspace={selectedWorkspace}
        />
      )}
    </>
  );
}