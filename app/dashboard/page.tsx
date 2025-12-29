import React from "react";
import AddNewButton from "@/modules/dashboard/components/add-new";
import AddRepo from "@/modules/dashboard/components/add-new-repo";
import {
  deleteProject,
  duplicateProjectId,
  editProjectById,
  getAllPlaygrounds,
} from "@/modules/dashboard/actions";
import { getAllCollabWorkspaces } from "@/modules/collaboration/workspaces/actions";
import ProjectTable from "@/modules/dashboard/components/project-table";
import CollabWorkspaceTable from "@/modules/collaboration/components/CollabWorkspaceTable";
import EmptyState from "@/modules/dashboard/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DashboardPage = async () => {
  const playgrounds = await getAllPlaygrounds();
  const workspaces = await getAllCollabWorkspaces();

  const hasPlaygrounds = playgrounds && playgrounds.length > 0;
  const hasWorkspaces = workspaces && workspaces.length > 0;

  return (
    <div className="flex flex-col justify-start items-center min-h-screen mx-auto max-w-7xl px-4 py-10">
      {/* Action Buttons */}
      <div className="grid grid-cols md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        <AddNewButton />
        <AddRepo />
      </div>

      {/* Tabs for Playgrounds and Workspaces */}
      <div className="mt-10 w-full">
        {!hasPlaygrounds && !hasWorkspaces ? (
          <EmptyState />
        ) : (
          <Tabs defaultValue="playgrounds" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="playgrounds">
                📁 My Playgrounds
                {hasPlaygrounds && (
                  <span className="ml-2 text-xs bg-primary/10 px-2 py-0.5 rounded-full">
                    {playgrounds.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="workspaces">
                🔥 Collab Workspaces
                {hasWorkspaces && (
                  <span className="ml-2 text-xs bg-orange-500/10 px-2 py-0.5 rounded-full">
                    {workspaces.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="playgrounds" className="mt-6">
              {hasPlaygrounds ? (
                <ProjectTable
                  projects={playgrounds || []}
                  onDeleteProject={deleteProject}
                  onUpdateProject={editProjectById}
                  onDuplicateProject={duplicateProjectId}
                />
              ) : (
                <div className="text-center py-12 border rounded-lg">
                  <p className="text-muted-foreground">
                    No playgrounds yet. Create one to get started!
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="workspaces" className="mt-6">
              {hasWorkspaces ? (
                <CollabWorkspaceTable workspaces={workspaces} />
              ) : (
                <div className="text-center py-12 border rounded-lg">
                  <p className="text-muted-foreground mb-2">
                    No collaboration workspaces yet.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Start a collaboration session from any playground to create
                    one.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;