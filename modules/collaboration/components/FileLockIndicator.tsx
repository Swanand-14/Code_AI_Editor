// components/FileLockIndicator.tsx
"use client";

import { Lock, LockOpen, Eye } from "lucide-react";
import { useEffect } from "react";
import { FileLock, UserPresence } from "../types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileLockIndicatorProps {
  fileId: string;
  locks: Map<string, FileLock>;
  participants: UserPresence[];
  currentUserId?: string;
}

export function FileLockIndicator({
  fileId,
  locks,
  participants,
  currentUserId,
}: FileLockIndicatorProps) {
  const lock = locks.get(fileId);
  
  // Get users viewing/editing this file
  const usersOnFile = participants.filter(
    (p) => p.currentFile?.fileId === fileId && p.userId !== currentUserId
  );

  const isLockedByOther = lock && lock.userId !== currentUserId;
  const isLockedByYou = lock && lock.userId === currentUserId;

  if (!lock && usersOnFile.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 text-xs">
        {/* Lock Status */}
        {isLockedByOther && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200">
                <Lock className="h-3 w-3" />
                <span className="font-medium">{lock.userName}</span>
                {lock.lockType === "hard" && (
                  <span className="text-xs">(read-only)</span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {lock.lockType === "hard"
                ? `${lock.userName} has locked this file for editing`
                : `${lock.userName} is actively editing this file`}
            </TooltipContent>
          </Tooltip>
        )}

        {isLockedByYou && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">
                <LockOpen className="h-3 w-3" />
                <span className="font-medium">You're editing</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              You have an active lock on this file
            </TooltipContent>
          </Tooltip>
        )}

        {/* Other Viewers */}
        {!isLockedByOther && usersOnFile.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">
                <Eye className="h-3 w-3" />
                <span className="font-medium">
                  {usersOnFile.length} viewing
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                {usersOnFile.map((user) => (
                  <div key={user.userId}>• {user.userName}</div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

// Hook to manage file locks
export function useFileLock(
  fileId: string,
  isActive: boolean,
  locks: Map<string, FileLock>,
  currentUserId?: string,
  emitFileLock?: (fileId: string, action: "acquire" | "release", lockType?: "soft" | "hard") => void
) {
  const lock = locks.get(fileId);
  const isLocked = !!lock;
  const isLockedByOther = lock && lock.userId !== currentUserId;
  const isReadOnly = isLockedByOther && lock.lockType === "hard";

  // Auto-acquire soft lock when editing
  useEffect(() => {
    if (!isActive || !emitFileLock || !currentUserId) return;

    // Acquire soft lock when file becomes active
    emitFileLock(fileId, "acquire", "soft");

    // Release lock when file becomes inactive or on unmount
    return () => {
      emitFileLock(fileId, "release");
    };
  }, [isActive, fileId, currentUserId, emitFileLock]);

  return {
    isLocked,
    isLockedByOther,
    isReadOnly,
    lockedBy: lock?.userName,
    lockType: lock?.lockType,
  };
}