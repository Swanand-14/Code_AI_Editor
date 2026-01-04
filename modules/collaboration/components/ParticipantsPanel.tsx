// components/ParticipantsPanel.tsx
"use client";

import { Users, Circle, Clock, FileText } from "lucide-react";
import { UserPresence } from "@/modules/collaboration/types";
import { formatDistanceToNow } from "date-fns";

interface ParticipantsPanelProps {
  participants: UserPresence[];
  currentUserId?: string;
  onUserClick?: (userId: string, fileId?: string) => void;
}

export function ParticipantsPanel({
  participants,
  currentUserId,
  onUserClick,
}: ParticipantsPanelProps) {
  const getStatusColor = (status: UserPresence["status"]) => {
    switch (status) {
      case "active":
        return "text-green-500";
      case "idle":
        return "text-yellow-500";
      case "offline":
        return "text-gray-400";
    }
  };

  const getStatusText = (status: UserPresence["status"]) => {
    switch (status) {
      case "active":
        return "Active";
      case "idle":
        return "Idle";
      case "offline":
        return "Offline";
    }
  };

  const formatLastActivity = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 120000) return "1m ago";
    if (diff < 300000) return `${Math.floor(diff / 60000)}m ago`;
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  const sortedParticipants = [...participants].sort((a, b) => {
    // Current user first
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    
    // Then by status
    const statusOrder = { active: 0, idle: 1, offline: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    // Then by last activity
    return b.lastActivity - a.lastActivity;
  });

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-sm">
          Participants ({participants.length})
        </h3>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto">
        {sortedParticipants.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No participants yet
          </div>
        ) : (
          <div className="divide-y">
            {sortedParticipants.map((participant) => {
              const isCurrentUser = participant.userId === currentUserId;
              const canNavigate = participant.currentFile && onUserClick;

              return (
                <div
                  key={participant.userId}
                  className={`px-4 py-3 hover:bg-muted/50 transition-colors ${
                    canNavigate ? "cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (canNavigate) {
                      onUserClick(participant.userId, participant.currentFile!.fileId);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar/Status */}
                    <div className="relative">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                        style={{ backgroundColor: participant.color }}
                      >
                        {participant.userName.charAt(0).toUpperCase()}
                      </div>
                      <Circle
                        className={`absolute -bottom-1 -right-1 h-3 w-3 fill-current ${getStatusColor(
                          participant.status
                        )}`}
                      />
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {participant.userName}
                          {isCurrentUser && (
                            <span className="text-xs text-muted-foreground ml-1">(You)</span>
                          )}
                        </span>
                        {participant.role === "host" && (
                          <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                            Host
                          </span>
                        )}
                      </div>

                      {/* Current File */}
                      {participant.currentFile ? (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span className="truncate">
                            {participant.currentFile.filePath.split("/").pop()}
                          </span>
                          {participant.isTyping && (
                            <span className="ml-1 text-blue-500 animate-pulse">●</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-1">
                          No file open
                        </div>
                      )}

                      {/* Last Activity */}
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatLastActivity(participant.lastActivity)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-3 border-t bg-muted/20">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="font-semibold text-green-600">
              {participants.filter((p) => p.status === "active").length}
            </div>
            <div className="text-muted-foreground">Active</div>
          </div>
          <div>
            <div className="font-semibold text-yellow-600">
              {participants.filter((p) => p.status === "idle").length}
            </div>
            <div className="text-muted-foreground">Idle</div>
          </div>
          <div>
            <div className="font-semibold text-gray-400">
              {participants.filter((p) => p.status === "offline").length}
            </div>
            <div className="text-muted-foreground">Offline</div>
          </div>
        </div>
      </div>
    </div>
  );
}