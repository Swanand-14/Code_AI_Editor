// components/ActivityFeed.tsx
"use client";

import { Activity, FileText, FolderPlus, Trash2, Users, Clock } from "lucide-react";
import { ActivityEvent } from "../types";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityFeedProps {
  activities: ActivityEvent[];
  currentUserId?: string;
}

export function ActivityFeed({ activities, currentUserId }: ActivityFeedProps) {
  const getActivityIcon = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "file_created":
        return <FileText className="h-4 w-4 text-green-600" />;
      case "file_deleted":
        return <Trash2 className="h-4 w-4 text-red-600" />;
      case "file_renamed":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "folder_created":
        return <FolderPlus className="h-4 w-4 text-green-600" />;
      case "folder_deleted":
        return <Trash2 className="h-4 w-4 text-red-600" />;
      case "user_joined":
        return <Users className="h-4 w-4 text-blue-600" />;
      case "user_left":
        return <Users className="h-4 w-4 text-gray-400" />;
      case "file_opened":
        return <FileText className="h-4 w-4 text-gray-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityColor = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "file_created":
      case "folder_created":
        return "bg-green-50 border-green-200";
      case "file_deleted":
      case "folder_deleted":
        return "bg-red-50 border-red-200";
      case "file_renamed":
        return "bg-blue-50 border-blue-200";
      case "user_joined":
        return "bg-blue-50 border-blue-200";
      case "user_left":
        return "bg-gray-50 border-gray-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Recent Activity</h3>
      </div>

      {/* Activity List */}
      <ScrollArea className="flex-1">
        {activities.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {activities.map((activity) => {
              const isCurrentUser = activity.userId === currentUserId;

              return (
                <div
                  key={activity.id}
                  className={`flex gap-3 p-3 rounded-lg border transition-colors ${getActivityColor(
                    activity.type
                  )}`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getActivityIcon(activity.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {isCurrentUser ? "You" : activity.userName}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {activity.description}
                      </span>
                    </p>

                    {/* Metadata */}
                    {activity.metadata?.filePath && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        {activity.metadata.filePath}
                      </p>
                    )}

                    {/* Timestamp */}
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimestamp(activity.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground text-center">
        Showing last {Math.min(activities.length, 20)} events
      </div>
    </div>
  );
}

// Hook to auto-log file operations as activities
export function useActivityLogger(
  emitActivity: (type: ActivityEvent["type"], description: string, metadata?: any) => void
) {
  const logFileCreated = (filePath: string) => {
    const fileName = filePath.split("/").pop();
    emitActivity("file_created", `created ${fileName}`, { filePath });
  };

  const logFileDeleted = (filePath: string) => {
    const fileName = filePath.split("/").pop();
    emitActivity("file_deleted", `deleted ${fileName}`, { filePath });
  };

  const logFileRenamed = (oldPath: string, newPath: string) => {
    const oldName = oldPath.split("/").pop();
    const newName = newPath.split("/").pop();
    emitActivity("file_renamed", `renamed ${oldName} to ${newName}`, {
      oldPath,
      newPath,
    });
  };

  const logFolderCreated = (folderPath: string) => {
    const folderName = folderPath.split("/").pop();
    emitActivity("folder_created", `created folder ${folderName}`, { filePath: folderPath });
  };

  const logFolderDeleted = (folderPath: string) => {
    const folderName = folderPath.split("/").pop();
    emitActivity("folder_deleted", `deleted folder ${folderName}`, { filePath: folderPath });
  };

  return {
    logFileCreated,
    logFileDeleted,
    logFileRenamed,
    logFolderCreated,
    logFolderDeleted,
  };
}