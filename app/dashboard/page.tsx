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
    <div className="min-h-screen bg-[#0b0f19] text-white">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[10%] w-[500px] h-[400px] rounded-full bg-indigo-600/[0.07] blur-[120px]" />
        <div className="absolute bottom-[20%] left-[5%] w-[400px] h-[300px] rounded-full bg-purple-600/[0.05] blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-12 pb-16">

        {/* Page Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Dashboard</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Your Projects</h1>
          <p className="text-slate-500 mt-1.5 text-sm">Manage your playgrounds and collaboration workspaces.</p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <AddNewButton />
          <AddRepo />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-xs text-slate-600 font-medium tracking-widest uppercase">Projects</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Content */}
        {!hasPlaygrounds && !hasWorkspaces ? (
          <EmptyState />
        ) : (
          <Tabs defaultValue="playgrounds" className="w-full">
            <TabsList className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 w-fit mb-6">
              <TabsTrigger
                value="playgrounds"
                className="rounded-lg text-slate-500 data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 data-[state=active]:shadow-none px-5 py-2 text-sm font-medium transition-all duration-200"
              >
                <svg className="w-3.5 h-3.5 mr-2 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                My Playgrounds
                {hasPlaygrounds && (
                  <span className="ml-2 text-[11px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                    {playgrounds.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="workspaces"
                className="rounded-lg text-slate-500 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300 data-[state=active]:shadow-none px-5 py-2 text-sm font-medium transition-all duration-200"
              >
                <svg className="w-3.5 h-3.5 mr-2 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
                Collab Workspaces
                {hasWorkspaces && (
                  <span className="ml-2 text-[11px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-semibold">
                    {workspaces.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="playgrounds" className="mt-0">
              {hasPlaygrounds ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <ProjectTable
                    projects={playgrounds || []}
                    onDeleteProject={deleteProject}
                    onUpdateProject={editProjectById}
                    onDuplicateProject={duplicateProjectId}
                  />
                </div>
              ) : (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/[0.08]">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm">No playgrounds yet. Create one to get started!</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="workspaces" className="mt-0">
              {hasWorkspaces ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <CollabWorkspaceTable workspaces={workspaces} />
                </div>
              ) : (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/[0.08]">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm mb-1.5">No collaboration workspaces yet.</p>
                  <p className="text-xs text-slate-600">Start a collaboration session from any playground to create one.</p>
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