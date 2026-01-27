"use client";
import { useEffect, useState,useCallback } from "react";
import { Users, Clock, AlertCircle, Wifi, WifiOff, GitBranch,Loader2,FileText,X } from "lucide-react";
import { toast } from "sonner";
import { joinCollabSession } from "@/modules/collaboration/actions";
import { useCollabSocket } from "@/modules/collaboration/hooks/useCollabSocket";
import type { CollabSessionData } from "@/modules/collaboration/types";
import { LoadingStep } from "@/modules/playground/components/loader";
import { currentUser } from "@/modules/auth/actions";
import React from "react";
import { useCollabParticipants } from "@/modules/collaboration/hooks/useCollabParticipants";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { GitHubFileTree } from "@/modules/github/components/github-file-tree";
import { fetchRepositoryTree, fetchFileContent } from "@/modules/github/actions";
import { CollabEditor } from "./CollabEditor";
import { getEditorLanguage } from "@/modules/playground/lib/editor-config";


interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size: number;
  content?: string;
}

interface OpenFile {
  path: string;
  content: string;
  sha: string;
  name: string;
}

interface GitHubCollabPlaygroundProps {
  session: CollabSessionData;
}

export function GitHubCollabPlayground({ session }: GitHubCollabPlaygroundProps) {
    const [isJoining, setIsJoining] = useState(true);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [user,setUser] = useState<{id:string;name:string;image?:string} | null>(null);
    const [files, setFiles] = useState<GitHubFile[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]));
    const {socket,isConnected, emitFileOpen } = useCollabSocket(
        session.sessionId,
        user?.id,
        user?.name
    )

    const {participants,activityLogs,updateActivity} = useCollabParticipants({
        socket,sessionId:session.sessionId,
        currentUserId:user?.id,

    });

    const loadRepositoryTree = useCallback(async () => {
    if (!session.repoOwner || !session.repoName || !session.branch) {
      toast.error("Repository information missing");
      return;
    }

    setIsLoadingTree(true);
    try {
      console.log(`📦 Fetching tree for ${session.repoOwner}/${session.repoName}@${session.branch}`);
      
      const result = await fetchRepositoryTree(
        session.repoOwner,
        session.repoName,
        session.branch
      );

      if (result.success) {
        console.log(`✅ Loaded ${result.data.length} files from GitHub`);
        setFiles(result.data);
        
        // Expand root directory by default
        setExpandedDirs(new Set([""]));
      } else {
        toast.error(result.error || "Failed to load repository");
        console.error("❌ Tree fetch error:", result.error);
      }
    } catch (error) {
      console.error("❌ Error loading tree:", error);
      toast.error("Failed to load repository files");
    } finally {
      setIsLoadingTree(false);
    }
  }, [session.repoOwner, session.repoName, session.branch]);

   const handleFileSelect = useCallback(async (file: GitHubFile) => {
    if (file.type === "dir") return;

    if (!session.repoOwner || !session.repoName || !session.branch) {
      toast.error("Repository information missing");
      return;
    }

    setIsLoadingFile(true);
    try {
      console.log(`📄 Fetching content for ${file.path}`);
      
      const result = await fetchFileContent(
        session.repoOwner,
        session.repoName,
        file.path,
        session.branch
      );

      if (result.success) {
        console.log(`✅ Loaded file: ${file.name}`);
        
        setOpenFile({
          path: file.path,
          content: result.data,
          sha: file.sha,
          name: file.name,
        });

        // 🔥 Emit file open event to other users
        emitFileOpen(file.sha, file.path);
        updateActivity(file.path);

        toast.success(`Opened ${file.name}`);
      } else {
        toast.error(result.error || "Failed to load file");
        console.error("❌ File fetch error:", result.error);
      }
    } catch (error) {
      console.error("❌ Error loading file:", error);
      toast.error("Failed to load file content");
    } finally {
      setIsLoadingFile(false);
    }
  }, [session.repoOwner, session.repoName, session.branch, emitFileOpen, updateActivity]);






    useEffect(()=>{
        let mounted = true;
        const join = async () => {
            try {
                console.log("Starting join Process for GitHub Session",session.sessionId);
                const currentUserData = await currentUser()
                if(!mounted)return;
                setUser(currentUserData?{id:currentUserData.id!,name:currentUserData.name!,image:currentUserData.image}:null);
                const result = await joinCollabSession(session.sessionId);
                if(!mounted)return;
                if(!result.success){
                    setJoinError(result.error || "Failed to join session");
                    toast.error(result.error)
                    setIsJoining(false)
                    return;
                }

                if(mounted){
                    toast.success("Successfully joined Github Collaboration session");
                }
                await loadRepositoryTree();
            } catch (error) {
                console.error("❌ Error joining session:", error);
        if (mounted) {
          setJoinError("An error occurred while joining");
          toast.error("Failed to join session");
        }
            }finally{
                if (mounted) {
          setIsJoining(false);
        }
            }
        }

        join();
        return () => {
      mounted = false;
    };
    },[session.sessionId,loadRepositoryTree]);

    useEffect(() => {
    if (!socket) return;

    const handleRemoteFileOpen = (payload: {
      userId: string;
      userName: string;
      fileId: string;
      filePath: string;
    }) => {
      if (payload.userId === user?.id) return;
      
      console.log(`👤 ${payload.userName} opened: ${payload.filePath}`);
      // Could show a toast or indicator here
    };

    socket.on("user:file-changed", handleRemoteFileOpen);

    return () => {
      socket.off("user:file-changed", handleRemoteFileOpen);
    };
  }, [socket, user?.id]);

    if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Joining GitHub Collaboration
          </h2>
          <div className="mb-8">
            <LoadingStep currentStep={1} step={1} label="Connecting to session" />
            <LoadingStep currentStep={2} step={2} label="Setting up workspace" />
            <LoadingStep currentStep={3} step={3} label="Ready to collaborate" />
          </div>
        </div>
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Failed to Join</h1>
        <p className="text-muted-foreground mb-6">{joinError}</p>
      </div>
    );
  }

  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const hoursRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  return (
    <div className="flex h-screen w-full bg-background">
      {/* 🔥 NEW: File Tree Sidebar */}
      <div className="w-64 border-r bg-muted/30 overflow-auto flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div>
            <h2 className="font-semibold">{session.repoName}</h2>
            <p className="text-xs text-muted-foreground">{session.repoOwner}</p>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span>{session.branch}</span>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t">
            Read-only mode • {files.length} files
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          {isLoadingTree ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : files.length > 0 ? (
            <GitHubFileTree
              files={files}
              onFileSelect={handleFileSelect}
              selectedPath={openFile?.path}
              expandedDirs={expandedDirs}
              onExpandedDirsChange={setExpandedDirs}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <p>No files found in repository</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold">GitHub Collaboration</h1>
                <p className="text-xs text-muted-foreground">
                  {session.repoOwner}/{session.repoName} • {session.branch}
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600">Disconnected</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="text-sm">{participants.length} online</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm">Expires in {hoursRemaining}h</span>
              </div>
            </div>
          </div>
        </header>

        {/* Participants Bar */}
        {participants.length > 0 && (
          <div className="border-b bg-muted/10 px-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              {participants.map((participant, index) => (
                <div
                  key={`${participant.userId}-${index}`}
                  className="flex items-center gap-1 px-2 py-1 bg-background rounded text-sm border"
                >
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>{participant.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({participant.role})
                  </span>
                  {participant.activeFile && (
                    <span className="text-xs text-muted-foreground ml-1">
                      • {participant.activeFile.split('/').pop()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File Tab (if file is open) */}
        {openFile && (
          <div className="border-b border-border bg-muted/30">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{openFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  {openFile.path}
                </span>
              </div>
              <button
                onClick={() => setOpenFile(null)}
                className="hover:bg-muted rounded p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content - Editor */}
        <div className="flex-1 overflow-hidden">
          {isLoadingFile ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : openFile ? (
            <CollabEditor
              sessionId={session.sessionId}
              userId={user?.id}
              userName={user?.name || "Anonymous"}
              fileId={openFile.sha}
              filePath={openFile.path}
              initialContent={openFile.content}
              language={getEditorLanguage(openFile.name.split('.').pop() || '')}
              // 🔥 Read-only - no onContentChange handler
              remoteCursors={[]}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
              <GitBranch className="h-16 w-16 text-muted-foreground" />
              <h2 className="text-2xl font-bold">GitHub Collaboration Room</h2>
              <p className="text-muted-foreground max-w-md">
                Repository: <span className="font-mono">{session.repoOwner}/{session.repoName}</span>
              </p>
              <p className="text-muted-foreground max-w-md">
                Branch: <span className="font-mono">{session.branch}</span>
              </p>
              <div className="pt-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm text-green-700 font-medium">
                    {participants.length} {participants.length === 1 ? 'person' : 'people'} connected
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground pt-4">
                Select a file from the sidebar to view code
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Participants & Activity Panel */}
      <ParticipantsPanel
        participants={participants}
        activityLogs={activityLogs}
        currentUserId={user?.id}
        followingUserId={null}
        onFollowToggle={() => {}}
      />
    </div>
  );


   
}