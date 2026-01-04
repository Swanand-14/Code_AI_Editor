export interface CreateCollabSessionRequest {
  projectType: "starter" | "github";
  templateId?: string;
  playgroundId?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
}

export interface CollabSessionResponse {
  success: boolean;
  sessionId?: string;
  shareUrl?: string;
  expiresAt?: string;
  error?: string;
}

export interface CollabSessionData {
  id: string;
  sessionId: string;
  projectType: string;
  templateId?: string;
  playgroundId?: string;
  templateSnapshot?: any;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  hostId?: string;
  hostType: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

// types/collaboration.ts
export interface UserCursor {
  userId: string;
  userName: string;
  userColor: string;
  fileId: string;
  position: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  timestamp: number;
}

export interface UserPresence {
  userId: string;
  userName: string;
  userImage?: string;
  role: "host" | "guest";
  status: "active" | "idle" | "offline";
  currentFile?: {
    fileId: string;
    filePath: string;
  };
  isTyping: boolean;
  lastActivity: number;
  color: string; // Consistent user color
}

export interface ActivityEvent {
  id: string;
  userId: string;
  userName: string;
  type: 
    | "file_created"
    | "file_deleted"
    | "file_renamed"
    | "folder_created"
    | "folder_deleted"
    | "user_joined"
    | "user_left"
    | "file_opened"
    | "session_started";
  description: string;
  metadata?: {
    filePath?: string;
    oldPath?: string;
    newPath?: string;
  };
  timestamp: number;
}

export interface FileLock {
  fileId: string;
  userId: string;
  userName: string;
  lockedAt: number;
  lockType: "soft" | "hard"; // soft = warning, hard = read-only
  autoReleaseAt: number;
}

export interface EditCollision {
  fileId: string;
  users: Array<{
    userId: string;
    userName: string;
    lineNumber: number;
  }>;
  collisionZone: {
    startLine: number;
    endLine: number;
  };
}

// Socket event payloads
export interface CursorMovePayload {
  sessionId: string;
  userId: string;
  userName: string;
  fileId: string;
  position: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

export interface PresenceUpdatePayload {
  sessionId: string;
  userId: string;
  userName: string;
  currentFile?: {
    fileId: string;
    filePath: string;
  };
  isTyping: boolean;
  status: "active" | "idle" | "offline";
}

export interface FileLockPayload {
  sessionId: string;
  userId: string;
  userName: string;
  fileId: string;
  action: "acquire" | "release";
  lockType: "soft" | "hard";
}

export interface ActivityPayload {
  sessionId: string;
  userId: string;
  userName: string;
  type: ActivityEvent["type"];
  description: string;
  metadata?: ActivityEvent["metadata"];
}

// User color generation
const USER_COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export function getUserColor(userId: string): string {
  // Generate consistent color based on userId hash
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}