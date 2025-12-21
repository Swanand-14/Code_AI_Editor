"use client";

import { useEffect, useState } from "react";
import { Users, Clock, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { joinCollabSession } from "../actions";
import { useCollabSocket } from "../hooks/useCollabSocket";
import type { CollabSessionData } from "../types";
import { LoadingStep } from "@/modules/playground/components/loader";
import { currentUser } from "@/modules/auth/actions";

interface CollabPlaygroundProps {
  session: CollabSessionData;
}

export function CollabPlayground({ session }: CollabPlaygroundProps) {
  const [isJoining, setIsJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

  // Initialize WebSocket connection
  const { isConnected, participants, socket } = useCollabSocket(
    session.sessionId,
    user?.id,
    user?.name
  );

  useEffect(() => {
    const join = async () => {
      // Get current user
      const currentUserData = await currentUser();
      setUser(currentUserData ? { id: currentUserData.id!, name: currentUserData.name! } : null);

      // Join session
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

          <div className="flex items-center gap-4">
            {/* Connection Status */}
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

            {/* Participants */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="text-sm">{participants.length} online</span>
            </div>

            {/* Expiry */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires in {hoursRemaining}h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Participants List */}
      {participants.length > 0 && (
        <div className="border-b bg-muted/10 px-6 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            {participants.map((participant) => (
              <div
                key={participant.userId}
                className="flex items-center gap-1 px-2 py-1 bg-background rounded text-sm border"
              >
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>{participant.userName}</span>
                <span className="text-xs text-muted-foreground">({participant.role})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Playground Content - TO BE INTEGRATED */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>

          <h2 className="text-2xl font-bold">
            Real-Time Collaboration Active! 🎉
          </h2>

          <div className="space-y-2 text-muted-foreground">
            <p>
              <strong>WebSocket Status:</strong>{" "}
              {isConnected ? "✅ Connected" : "❌ Disconnected"}
            </p>
            <p>
              <strong>Active Users:</strong> {participants.length}
            </p>
            <p>
              <strong>Session ID:</strong> {session.sessionId}
            </p>
          </div>

          <div className="mt-8 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-900 dark:text-green-100">
              <strong>✅ Phase 2 Complete:</strong> WebSocket connection is live!
              Next step: Integrate Monaco editor with real-time sync.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}