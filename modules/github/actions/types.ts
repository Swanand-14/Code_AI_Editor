export interface WorkspaceDraft {
  userId: string;
  repoFullName: string;
  branch: string;
  modifiedFiles: {
    path: string;
    content: string;
    sha: string;
  }[];
  createdFiles: {
    path: string;
    content: string;
  }[];
  deletedFiles: string[];
  lastSaved: Date;
  expiresAt: Date; // Auto-delete after 7 days
}