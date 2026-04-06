"use client";

import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Trash2,
  Copy,
  FolderOpen,
  Users,
  GitBranch,
  Github,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { deleteCollabWorkspace, type CollabWorkspaceRow } from "../workspaces/actions";
import { ReopenWorkspaceDialog } from "./ReopenWorkspaceDialog";

// ─── Sub-table (shared by both tabs) ────────────────────────────────────────

interface WorkspaceTableProps {
  workspaces: CollabWorkspaceRow[];
  onReopenClick: (w: CollabWorkspaceRow) => void;
  onDeleteClick: (w: CollabWorkspaceRow) => void;
  onCopyUrl: (sessionId: string) => void;
  isGitHub?: boolean;
}

function WorkspaceTable({
  workspaces,
  onReopenClick,
  onDeleteClick,
  onCopyUrl,
  isGitHub = false,
}: WorkspaceTableProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (workspaces.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground mb-2">
          {isGitHub
            ? "No GitHub collaboration workspaces yet."
            : "No template collaboration workspaces yet."}
        </p>
        <p className="text-sm text-muted-foreground">
          {isGitHub
            ? "Start a collaboration session from a GitHub repository."
            : "Start a collaboration session from any playground to create one."}
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workspace</TableHead>
            {isGitHub ? (
              <TableHead>Repository</TableHead>
            ) : (
              <TableHead>Template</TableHead>
            )}
            <TableHead>Files</TableHead>
            <TableHead>Last Saved</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workspaces.map((workspace) => (
            <TableRow key={workspace.id}>
              {/* Name + session ID */}
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    {isGitHub ? (
                      <Github className="h-4 w-4 text-slate-600" />
                    ) : (
                      <Users className="h-4 w-4 text-orange-500" />
                    )}
                    <span className="font-semibold">{workspace.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {workspace.sessionId}
                  </span>
                </div>
              </TableCell>

              {/* Template badge OR repo + branch */}
              <TableCell>
                {isGitHub ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-mono">
                      {workspace.repoOwner}/{workspace.repoName}
                    </span>
                    {workspace.branch && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        {workspace.branch}
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-orange-500/10 text-orange-600 border-orange-500"
                  >
                    {workspace.originalTemplateName || "Custom"}
                  </Badge>
                )}
              </TableCell>

              {/* File count + size */}
              <TableCell>
                <div className="flex flex-col text-sm">
                  <span>{workspace.fileCount} files</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(workspace.totalSize)}
                  </span>
                </div>
              </TableCell>

              {/* Last saved */}
              <TableCell>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(workspace.lastSavedAt), {
                    addSuffix: true,
                  })}
                </span>
              </TableCell>

              {/* Owner */}
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden">
                    <Image
                      src={workspace.owner?.image || "/placeholder.svg"}
                      alt={workspace.owner?.name}
                      width={32}
                      height={32}
                      className="object-cover"
                    />
                  </div>
                  <span className="text-sm">{workspace.owner.name}</span>
                </div>
              </TableCell>

              {/* Actions */}
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onReopenClick(workspace)}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open Workspace
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onCopyUrl(workspace.sessionId)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Collab Link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteClick(workspace)}
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
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface CollabWorkspaceTableProps {
  workspaces: CollabWorkspaceRow[];
}

export default function CollabWorkspaceTable({
  workspaces,
}: CollabWorkspaceTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<CollabWorkspaceRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Split by projectType
  const templateWorkspaces = workspaces.filter(
    (w) => w.projectType === "starter"
  );
  const githubWorkspaces = workspaces.filter(
    (w) => w.projectType === "github"
  );

  const handleDeleteClick = (w: CollabWorkspaceRow) => {
    setSelectedWorkspace(w);
    setDeleteDialogOpen(true);
  };

  const handleReopenClick = (w: CollabWorkspaceRow) => {
    setSelectedWorkspace(w);
    setReopenDialogOpen(true);
  };

  const handleCopyUrl = (sessionId: string) => {
    const url = `${window.location.origin}/collab/${sessionId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Collaboration URL copied!"))
      .catch(() => toast.error("Failed to copy URL"));
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) return;
    setIsDeleting(true);
    try {
      const result = await deleteCollabWorkspace(selectedWorkspace.sessionId);
      if (result.success) {
        setDeleteDialogOpen(false);
        toast.success("Workspace deleted");
        window.location.reload();
      } else {
        toast.error(result.error || "Failed to delete workspace");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Tabs defaultValue="template" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2 mb-4">
          <TabsTrigger value="template">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Template
            {templateWorkspaces.length > 0 && (
              <span className="ml-1.5 text-xs bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded-full">
                {templateWorkspaces.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="github">
            <Github className="h-3.5 w-3.5 mr-1.5" />
            GitHub
            {githubWorkspaces.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {githubWorkspaces.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="template">
          <WorkspaceTable
            workspaces={templateWorkspaces}
            onReopenClick={handleReopenClick}
            onDeleteClick={handleDeleteClick}
            onCopyUrl={handleCopyUrl}
            isGitHub={false}
          />
        </TabsContent>

        <TabsContent value="github">
          <WorkspaceTable
            workspaces={githubWorkspaces}
            onReopenClick={handleReopenClick}
            onDeleteClick={handleDeleteClick}
            onCopyUrl={handleCopyUrl}
            isGitHub={true}
          />
        </TabsContent>
      </Tabs>

      {/* Delete dialog */}
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkspace}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen dialog */}
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