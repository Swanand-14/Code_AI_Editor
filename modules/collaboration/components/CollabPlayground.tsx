"use client";

import { useEffect, useState } from "react";
import { Users, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { joinCollabSession } from "../actions";
import type { CollabSessionData } from "../types";
import { LoadingStep } from "@/modules/playground/components/loader";

interface CollabPlaygroundProps {
  session: CollabSessionData;
}

export function CollabPlayground({ session }: CollabPlaygroundProps) {
  const [isJoining, setIsJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const join = async () => {
      const result = await joinCollabSession(session.sessionId);
      
      if (!result.success) {
        setJoinError(result.error || "Failed to join session");
        toast.error(result.error);
      } else {
        toast.success("Successfully joined collaboration session!");
      }
      
      setIsJoining(false);
    };

    join();
  }, [session.sessionId]);

  if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Joining Collaboration Session
          </h2>
          <div className="mb-8">
            <LoadingStep currentStep={1} step={1} label="Connecting to session" />
            <LoadingStep currentStep={2} step={2} label="Loading playground" />
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

  // Calculate time remaining
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const hoursRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Collaboration Header */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-semibold">Collaboration Session</h1>
              <p className="text-xs text-muted-foreground">
                Session ID: {session.sessionId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Expires in {hoursRemaining}h</span>
          </div>
        </div>
      </div>

      {/* Placeholder Content - Replace with actual playground */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>
          
          <h2 className="text-2xl font-bold">
            You've Joined the Collaboration Session! 🎉
          </h2>
          
          <div className="space-y-2 text-muted-foreground">
            <p>
              <strong>Session ID:</strong> {session.sessionId}
            </p>
            <p>
              <strong>Project Type:</strong> {session.projectType}
            </p>
            {session.playgroundId && (
              <p>
                <strong>Playground ID:</strong> {session.playgroundId}
              </p>
            )}
            {session.templateId && (
              <p>
                <strong>Template ID:</strong> {session.templateId}
              </p>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Next Steps:</strong> Real-time collaboration features
              (live editing, cursor sync, WebSocket communication) will be
              implemented in the next phase. For now, this page confirms the
              session routing works correctly.
            </p>
          </div>

          {session.templateSnapshot && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-sm font-medium">
                View Template Snapshot (Debug)
              </summary>
              <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(session.templateSnapshot, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}