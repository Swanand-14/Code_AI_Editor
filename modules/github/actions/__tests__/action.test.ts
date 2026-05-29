import { describe, it, expect, vi, beforeEach } from "vitest";
 
// ─── Hoist the shared mock instance so it's available inside vi.mock() ────────
const mockGitHubClient = vi.hoisted(() => ({
  getRepositories: vi.fn(),
  getRepoTree: vi.fn(),
  getFileContent: vi.fn(),
  updateFile: vi.fn(),
  createFile: vi.fn(),
  createRepository: vi.fn(),
  getBranch: vi.fn(),
  getTreeEntries: vi.fn(),
  createBlob: vi.fn(),
  createTreeDirect: vi.fn(),
  createCommit: vi.fn(),
  updateRef: vi.fn(),
  deleteFile: vi.fn(),
  deleteMultipleFiles: vi.fn(),
  createDirectory: vi.fn(),
}));
 
// ─── Mock boundaries ──────────────────────────────────────────────────────────
 
vi.mock("@/auth", () => ({ auth: vi.fn() }));
 
vi.mock("@/lib/db", () => ({
  prisma: {
    gitHubRepository: { upsert: vi.fn(), findMany: vi.fn() },
    workspaceDraft: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));
 
vi.mock("../../lib/github-client", () => ({
  // Use a real function so Vitest treats it as a valid constructor
  GitHubClient: function GitHubClient() {
    return mockGitHubClient;
  },
}));
 
vi.mock("../../lib/github-token", () => ({ requireGitHubToken: vi.fn() }));
 
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
 
// ─── Imports AFTER mocks ──────────────────────────────────────────────────────
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireGitHubToken } from "../../lib/github-token";
import {
  fetchUserRepositories,
  fetchRepositoryTree,
  fetchFileContent,
  saveFileToGitHub,
  linkRepositoryToUser,
  getUserLinkedRepos,
  createFileInGitHub,
  createFolderInGitHub,
  deleteFileFromGitHub,
  deleteFolderFromGithub,
  createGitHubRepository,
  saveWorkspaceDraft,
  loadWorkspaceDraft,
  deleteWorkspaceDraft,
  commitAllChangesToGitHub,
} from "../index";
 
// ─── Typed helpers ────────────────────────────────────────────────────────────
const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockRequireToken = requireGitHubToken as ReturnType<typeof vi.fn>;
 
function mockSession(userId = "user-123") {
  mockAuth.mockResolvedValue({ user: { id: userId } });
}
function mockNoSession() {
  mockAuth.mockResolvedValue(null);
}
function mockToken(token = "ghp_test_token") {
  mockRequireToken.mockResolvedValue(token);
}
function mockTokenThrows(msg = "GitHub not connected. Please sign in with GitHub.") {
  mockRequireToken.mockRejectedValue(new Error(msg));
}
 
beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchUserRepositories", () => {
  it("returns repos on success", async () => {
    mockToken();
    const repos = [{ id: 1, name: "repo-one", full_name: "alice/repo-one" }];
    mockGitHubClient.getRepositories.mockResolvedValue(repos);
 
    const result = await fetchUserRepositories();
 
    expect(result.success).toBe(true);
    expect(result.data).toEqual(repos);
  });
 
  it("returns success:false when GitHub token is missing", async () => {
    mockTokenThrows();
 
    const result = await fetchUserRepositories();
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GitHub not connected/);
  });
 
  it("returns success:false when GitHubClient.getRepositories throws", async () => {
    mockToken();
    mockGitHubClient.getRepositories.mockRejectedValue(new Error("rate limited"));
 
    const result = await fetchUserRepositories();
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("rate limited");
  });
});

describe("fetchRepositoryTree", () => {
  it("returns tree on success and passes branch through to getRepoTree", async () => {
    mockToken();
    const tree = [{ path: "src/index.ts", type: "file" }];
    mockGitHubClient.getRepoTree.mockResolvedValue(tree);
 
    const result = await fetchRepositoryTree("alice", "my-repo", "main");
 
    expect(result.success).toBe(true);
    expect(result.data).toEqual(tree);
    expect(mockGitHubClient.getRepoTree).toHaveBeenCalledWith("alice", "my-repo", "main");
  });
 
  it("returns success:false when token is missing", async () => {
    mockTokenThrows();
 
    const result = await fetchRepositoryTree("alice", "my-repo");
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GitHub not connected/);
  });
 
  it("returns success:false when getRepoTree throws", async () => {
    mockToken();
    mockGitHubClient.getRepoTree.mockRejectedValue(new Error("repo not found"));
 
    const result = await fetchRepositoryTree("alice", "missing-repo");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("repo not found");
  });
});
describe("fetchFileContent", () => {
  it("returns file content on success", async () => {
    mockToken();
    mockGitHubClient.getFileContent.mockResolvedValue("export const x = 1;");
 
    const result = await fetchFileContent("alice", "repo", "src/x.ts", "main");
 
    expect(result.success).toBe(true);
    expect(result.data).toBe("export const x = 1;");
  });
 
  it("returns success:false when file is not found", async () => {
    mockToken();
    mockGitHubClient.getFileContent.mockRejectedValue(new Error("Not Found"));
 
    const result = await fetchFileContent("alice", "repo", "missing.ts");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not Found");
  });
});

describe("saveFileToGitHub", () => {
  it("calls updateFile with correct params and returns success", async () => {
    mockToken();
    mockGitHubClient.updateFile.mockResolvedValue({ commit: "abc", content: { sha: "xyz" } });
 
    const result = await saveFileToGitHub(
      "alice", "repo", "README.md", "# Hello", "update readme", "old-sha", "main"
    );
 
    expect(result.success).toBe(true);
    expect(mockGitHubClient.updateFile).toHaveBeenCalledWith(
      "alice", "repo", "README.md", "# Hello", "update readme", "old-sha", "main"
    );
  });
 
  it("returns success:false when updateFile throws", async () => {
    mockToken();
    mockGitHubClient.updateFile.mockRejectedValue(new Error("conflict"));
 
    const result = await saveFileToGitHub("a", "r", "f.ts", "c", "msg");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("conflict");
  });
});

describe("linkRepositoryToUser", () => {
  it("upserts repo record with correct structure and returns success:true", async () => {
    mockSession();
    (prisma.gitHubRepository.upsert as any).mockResolvedValue({});
 
    const result = await linkRepositoryToUser("alice/my-repo", 42, "main");
 
    expect(result.success).toBe(true);
    expect(prisma.gitHubRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_repoFullName: { userId: "user-123", repoFullName: "alice/my-repo" } },
        create: expect.objectContaining({ repoFullName: "alice/my-repo", repoId: 42, defaultBranch: "main" }),
        update: expect.objectContaining({ lastSyncedAt: expect.any(Date) }),
      })
    );
  });
 
  it("returns success:false when user is not authenticated", async () => {
    mockNoSession();
 
    const result = await linkRepositoryToUser("alice/my-repo", 42, "main");
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authenticated/i);
  });
 
  it("returns success:false when prisma upsert throws", async () => {
    mockSession();
    (prisma.gitHubRepository.upsert as any).mockRejectedValue(new Error("DB connection lost"));
 
    const result = await linkRepositoryToUser("alice/my-repo", 42, "main");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection lost");
  });
});

describe("getUserLinkedRepos", () => {
  it("returns linked repos for authenticated user", async () => {
    mockSession();
    const repos = [{ id: "1", repoFullName: "alice/repo" }];
    (prisma.gitHubRepository.findMany as any).mockResolvedValue(repos);
 
    const result = await getUserLinkedRepos();
 
    expect(result.success).toBe(true);
    expect(result.data).toEqual(repos);
    expect(prisma.gitHubRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-123" } })
    );
  });
 
  it("returns success:false when not authenticated", async () => {
    mockNoSession();
 
    const result = await getUserLinkedRepos();
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not authenticated/);
  });
 
  it("returns success:false when prisma throws", async () => {
    mockSession();
    (prisma.gitHubRepository.findMany as any).mockRejectedValue(new Error("timeout"));
 
    const result = await getUserLinkedRepos();
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("timeout");
  });
});
describe("createFileInGitHub", () => {
  it("delegates to GitHubClient.createFile and returns success", async () => {
    mockToken();
    mockGitHubClient.createFile.mockResolvedValue({ commit: "c", content: { sha: "s" } });
 
    const result = await createFileInGitHub("alice", "repo", "src/new.ts", "// new", "add file", "main");
 
    expect(result.success).toBe(true);
    expect(mockGitHubClient.createFile).toHaveBeenCalledWith(
      "alice", "repo", "src/new.ts", "// new", "add file", "main"
    );
  });
 
  it("returns success:false when file already exists", async () => {
    mockToken();
    mockGitHubClient.createFile.mockRejectedValue(new Error("File already exists"));
 
    const result = await createFileInGitHub("a", "r", "existing.ts", "", "msg");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("File already exists");
  });
});
describe("createFolderInGitHub", () => {
  it("delegates to GitHubClient.createDirectory and returns success", async () => {
    mockToken();
    mockGitHubClient.createDirectory.mockResolvedValue(undefined);
 
    const result = await createFolderInGitHub("alice", "repo", "src/components", "add folder", "main");
 
    expect(result.success).toBe(true);
    expect(mockGitHubClient.createDirectory).toHaveBeenCalledWith(
      "alice", "repo", "src/components", "add folder", "main"
    );
  });
 
  it("returns success:false when createDirectory throws", async () => {
    mockToken();
    mockGitHubClient.createDirectory.mockRejectedValue(new Error("permission denied"));
 
    const result = await createFolderInGitHub("a", "r", "path", "msg");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("permission denied");
  });
});

describe("deleteFileFromGitHub", () => {
  it("delegates to GitHubClient.deleteFile and returns success", async () => {
    mockToken();
    mockGitHubClient.deleteFile.mockResolvedValue(undefined);
 
    const result = await deleteFileFromGitHub("alice", "repo", "old.ts", "remove", "file-sha", "main");
 
    expect(result.success).toBe(true);
  });
 
  it("returns success:false when deleteFile throws", async () => {
    mockToken();
    mockGitHubClient.deleteFile.mockRejectedValue(new Error("sha mismatch"));
 
    const result = await deleteFileFromGitHub("a", "r", "f.ts", "msg", "sha");
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("sha mismatch");
  });
});
describe("deleteFolderFromGithub", () => {
  it("filters files to the target folder path and calls deleteMultipleFiles", async () => {
    mockToken();
    mockGitHubClient.deleteMultipleFiles.mockResolvedValue(undefined);
 
    const allFiles = [
      { path: "src/utils/a.ts", sha: "sha-a" },
      { path: "src/utils/b.ts", sha: "sha-b" },
      { path: "src/other.ts",   sha: "sha-other" }, // must NOT be deleted
    ];
 
    const result = await deleteFolderFromGithub("alice", "repo", "src/utils", "remove utils", allFiles, "main");
 
    expect(result.success).toBe(true);
    expect((result as any).deleteCount).toBe(2);
 
    const passedFiles = mockGitHubClient.deleteMultipleFiles.mock.calls[0][2];
    expect(passedFiles.map((f: any) => f.path)).toEqual(["src/utils/a.ts", "src/utils/b.ts"]);
  });
 
  it("returns success:false when no files match the folder path", async () => {
    mockToken();
 
    const result = await deleteFolderFromGithub(
      "alice", "repo", "nonexistent/folder", "msg",
      [{ path: "src/other.ts", sha: "s" }]
    );
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("No files found in folder");
  });
 
  it("returns success:false when deleteMultipleFiles throws", async () => {
    mockToken();
    mockGitHubClient.deleteMultipleFiles.mockRejectedValue(new Error("API error"));
 
    const result = await deleteFolderFromGithub(
      "a", "r", "src/utils", "msg",
      [{ path: "src/utils/a.ts", sha: "sha-a" }]
    );
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("API error");
  });
});

describe("createGitHubRepository", () => {
  const params = {
    name: "new-repo", description: "My repo", isPrivate: false,
    initializeWithReadme: true, addGitIgnore: true,
  };
  const files = [{ path: "src/index.ts", content: "// hello" }];
 
  it("creates repo, links it to user, and returns success with data", async () => {
    mockSession();
    mockToken();
    const repoResult = {
      fullName: "alice/new-repo", repoId: 99, defaultBranch: "main",
      url: "u", owner: "alice", name: "new-repo",
    };
    mockGitHubClient.createRepository.mockResolvedValue(repoResult);
    (prisma.gitHubRepository.upsert as any).mockResolvedValue({});
 
    const result = await createGitHubRepository(params, files);
 
    expect(result.success).toBe(true);
    expect((result as any).data).toEqual(repoResult);
    expect(mockGitHubClient.createRepository).toHaveBeenCalledWith(params, files);
    expect(prisma.gitHubRepository.upsert).toHaveBeenCalled();
  });
 
  it("returns success:false when user is not authenticated", async () => {
    mockNoSession();
 
    const result = await createGitHubRepository(params, files);
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unauthenticated/i);
  });
 
  it("returns success:false when GitHub token is missing", async () => {
    mockSession();
    mockTokenThrows();
 
    const result = await createGitHubRepository(params, files);
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GitHub not connected/);
  });
 
  it("returns success:false when createRepository throws", async () => {
    mockSession();
    mockToken();
    mockGitHubClient.createRepository.mockRejectedValue(new Error("repo name taken"));
 
    const result = await createGitHubRepository(params, files);
 
    expect(result.success).toBe(false);
    expect(result.error).toBe("repo name taken");
  });
});
describe("saveWorkspaceDraft", () => {
  const draft = {
    repoFullName: "alice/repo", branch: "main",
    modifiedFiles: [{ path: "src/x.ts", content: "// x", sha: "s" }],
    createdFiles: [], deletedFiles: [],
  };
 
  it("upserts draft for authenticated user and returns success:true", async () => {
    mockSession();
    (prisma.workspaceDraft.upsert as any).mockResolvedValue({});
 
    const result = await saveWorkspaceDraft(draft);
 
    expect(result.success).toBe(true);
    expect(prisma.workspaceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_repoFullName_branch: { userId: "user-123", repoFullName: "alice/repo", branch: "main" } },
        create: expect.objectContaining({ userId: "user-123", repoFullName: "alice/repo", branch: "main" }),
      })
    );
  });
 
  it("uses session-scoped storage key when sessionId is provided", async () => {
    mockSession();
    (prisma.workspaceDraft.upsert as any).mockResolvedValue({});
 
    await saveWorkspaceDraft({ ...draft, sessionId: "sess-abc" });
 
    const call = (prisma.workspaceDraft.upsert as any).mock.calls[0][0];
    expect(call.where.userId_repoFullName_branch.branch).toBe("main::session::sess-abc");
  });
 
  it("returns success:false when not authenticated", async () => {
    mockNoSession();
 
    const result = await saveWorkspaceDraft(draft);
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not authenticated/);
  });
 
  it("sets expiresAt to 7 days in the future", async () => {
    mockSession();
    (prisma.workspaceDraft.upsert as any).mockResolvedValue({});
    const before = Date.now();
 
    await saveWorkspaceDraft(draft);
 
    const call = (prisma.workspaceDraft.upsert as any).mock.calls[0][0];
    const expiresAt: Date = call.create.expiresAt;
    const diff = expiresAt.getTime() - before;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(diff).toBeGreaterThanOrEqual(sevenDaysMs - 100);
    expect(diff).toBeLessThanOrEqual(sevenDaysMs + 1000);
  });
});

describe("loadWorkspaceDraft", () => {
  it("returns draft data when found, normalising branch to original name", async () => {
    mockSession();
    const savedDraft = { branch: "main", repoFullName: "alice/repo", modifiedFiles: [], createdFiles: [], deletedFiles: [] };
    (prisma.workspaceDraft.findUnique as any).mockResolvedValue(savedDraft);
 
    const result = await loadWorkspaceDraft("alice/repo", "main");
 
    expect(result.success).toBe(true);
    expect((result as any).data.branch).toBe("main");
  });
 
  it("returns success:true with data:null when no draft exists", async () => {
    mockSession();
    (prisma.workspaceDraft.findUnique as any).mockResolvedValue(null);
 
    const result = await loadWorkspaceDraft("alice/repo", "feature/new");
 
    expect(result.success).toBe(true);
    expect((result as any).data).toBeNull();
  });
 
  it("returns success:false when not authenticated", async () => {
    mockNoSession();
 
    const result = await loadWorkspaceDraft("alice/repo", "main");
 
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not authenticated/);
  });
});
describe("deleteWorkspaceDraft", () => {
  it("deletes draft and returns success:true", async () => {
    mockSession();
    (prisma.workspaceDraft.delete as any).mockResolvedValue({});
 
    const result = await deleteWorkspaceDraft("alice/repo", "main");
 
    expect(result.success).toBe(true);
    expect(prisma.workspaceDraft.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_repoFullName_branch: { userId: "user-123", repoFullName: "alice/repo", branch: "main" } },
      })
    );
  });
 
  it("returns success:false when not authenticated", async () => {
    mockNoSession();
 
    const result = await deleteWorkspaceDraft("alice/repo", "main");
 
    expect(result.success).toBe(false);
  });
});

describe("commitAllChangesToGitHub", () => {
  /** Wire up the full happy-path mock chain */
  function setupCommitMocks() {
    mockToken();
    mockGitHubClient.getBranch.mockResolvedValue({
      commit: {
        sha: "current-commit-sha",
        commit: { tree: { sha: "base-tree-sha" } },
      },
    });
    mockGitHubClient.getTreeEntries.mockResolvedValue([
      { path: "src/existing.ts", sha: "existing-blob-sha", type: "blob" },
    ]);
    mockGitHubClient.createBlob.mockResolvedValue({ sha: "new-blob-sha" });
    mockGitHubClient.createTreeDirect.mockResolvedValue({ sha: "new-tree-sha" });
    mockGitHubClient.createCommit.mockResolvedValue({ sha: "new-commit-sha" });
    mockGitHubClient.updateRef.mockResolvedValue({});
    mockGitHubClient.getRepoTree.mockResolvedValue([{ path: "src/existing.ts", type: "file" }]);
    mockGitHubClient.getFileContent.mockResolvedValue("// content");
  }
 
  it("returns success with commitSha and changesCount on happy path", async () => {
    setupCommitMocks();
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "src/existing.ts", type: "modified", content: "// updated" }],
      "feat: update", "main"
    );
 
    expect(result.success).toBe(true);
    expect((result as any).commitSha).toBe("new-commit-sha");
    expect((result as any).changesCount).toBe(1);
  });
 
  it("deduplicates changes — last entry wins when same path appears twice", async () => {
    setupCommitMocks();
 
    await commitAllChangesToGitHub(
      "alice", "repo",
      [
        { path: "src/x.ts", type: "modified", content: "// version 1" },
        { path: "src/x.ts", type: "modified", content: "// version 2" },
      ],
      "dedup test", "main"
    );
 
    // createBlob must be called exactly once — the duplicate was dropped
    expect(mockGitHubClient.createBlob).toHaveBeenCalledTimes(1);
  });
 
  it("reads tree SHA from commit.commit.tree.sha — not commit.sha", async () => {
    // RATIONALE: Using the wrong field causes a BadObjectState GitHub API error.
    setupCommitMocks();
 
    await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "f.ts", type: "modified", content: "x" }],
      "msg", "main"
    );
 
    expect(mockGitHubClient.getTreeEntries).toHaveBeenCalledWith(
      "alice", "repo", "base-tree-sha" // tree SHA, NOT the commit SHA
    );
  });
 
  it("uses commit.sha as the parent for the new commit", async () => {
    setupCommitMocks();
 
    await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "f.ts", type: "modified", content: "x" }],
      "msg", "main"
    );
 
    expect(mockGitHubClient.createCommit).toHaveBeenCalledWith(
      "alice", "repo",
      expect.objectContaining({ parents: ["current-commit-sha"] })
    );
  });
 
  it("excludes deleted files from the new tree", async () => {
    mockToken();
    mockGitHubClient.getBranch.mockResolvedValue({
      commit: { sha: "c", commit: { tree: { sha: "t" } } },
    });
    mockGitHubClient.getTreeEntries.mockResolvedValue([
      { path: "src/to-delete.ts", sha: "del-sha", type: "blob" },
      { path: "src/keep.ts",      sha: "keep-sha", type: "blob" },
    ]);
    mockGitHubClient.createTreeDirect.mockResolvedValue({ sha: "nt" });
    mockGitHubClient.createCommit.mockResolvedValue({ sha: "nc" });
    mockGitHubClient.updateRef.mockResolvedValue({});
    mockGitHubClient.getRepoTree.mockResolvedValue([]);
    mockGitHubClient.getFileContent.mockResolvedValue("");
 
    await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "src/to-delete.ts", type: "deleted" }],
      "remove file", "main"
    );
 
    // createTreeDirect signature: (owner, repo, treeEntries) — index 2 is the array
    const treeEntries = mockGitHubClient.createTreeDirect.mock.calls[0][2];
    const paths = treeEntries.map((e: any) => e.path);
    expect(paths).not.toContain("src/to-delete.ts");
    expect(paths).toContain("src/keep.ts");
  });
 
  it("returns success:false with friendly message on 401 auth error", async () => {
    mockToken();
    mockGitHubClient.getBranch.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "f.ts", type: "modified", content: "x" }],
      "msg", "main"
    );
 
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/GitHub auth failed/);
  });
 
  it("returns success:false with friendly message on 404 branch not found", async () => {
    mockToken();
    mockGitHubClient.getBranch.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 })
    );
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "f.ts", type: "modified", content: "x" }],
      "msg", "ghost-branch"
    );
 
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/Branch.*not found/i);
  });
 
  it("returns success:false with friendly message on 409 branch conflict", async () => {
    mockToken();
    mockGitHubClient.getBranch.mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409 })
    );
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "f.ts", type: "modified", content: "x" }],
      "msg", "main"
    );
 
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/conflict|pushed/i);
  });
});
 