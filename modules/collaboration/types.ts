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