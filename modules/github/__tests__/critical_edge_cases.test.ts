import { describe, it, expect, vi, beforeEach } from "vitest";
 const mockGitHubClient = vi.hoisted(() => ({
  getBranch: vi.fn(),
  getTreeEntries: vi.fn(),
  createBlob: vi.fn(),
  createTreeDirect: vi.fn(),
  createCommit: vi.fn(),
  updateRef: vi.fn(),
  getRepoTree: vi.fn(),
  getFileContent: vi.fn(),
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteMultipleFiles: vi.fn(),
  createDirectory: vi.fn(),
  createRepository: vi.fn(),
  updateFile: vi.fn(),
  getRepositories: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gitHubRepository: { upsert: vi.fn(), findMany: vi.fn() },
    workspaceDraft: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("../lib/github-client", () => ({
  GitHubClient: function GitHubClient() {
    return mockGitHubClient;
  },
}));
vi.mock("../lib/github-token", () => ({ requireGitHubToken: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireGitHubToken } from "../lib/github-token";
import {
  commitAllChangesToGitHub,
  createFileInGitHub,
  deleteFolderFromGithub,
  saveFileToGitHub,
} from "../actions/index";

const mockRequireToken = requireGitHubToken as ReturnType<typeof vi.fn>;
 
function mockToken() {
  mockRequireToken.mockResolvedValue("ghp_test_token");
}

function setupBranchAndTree() {
  mockGitHubClient.getBranch.mockResolvedValue({
    commit: {
      sha: "current-commit-sha",
      commit: { tree: { sha: "base-tree-sha" } },
    },
  });
  mockGitHubClient.getTreeEntries.mockResolvedValue([
    { path: "src/a.ts", sha: "sha-a", type: "blob" },
    { path: "src/b.ts", sha: "sha-b", type: "blob" },
  ]);
  // Post-commit reads — needed so the final getRepoTree path doesn't blow up
  mockGitHubClient.getRepoTree.mockResolvedValue([]);
  mockGitHubClient.getFileContent.mockResolvedValue("");
}
 
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Partial failure — branch integrity after mid-commit errors", () => {
  it("blob upload fails mid-batch: updateRef is never called (branch not corrupted)", async () => {
    // RATIONALE: blobs for file 1 succeed, file 2 fails. The branch ref must
    // NOT be updated — otherwise it would point to a half-written tree.
    mockToken();
    setupBranchAndTree();
 
    mockGitHubClient.createBlob
      .mockResolvedValueOnce({ sha: "blob-1-sha" }) // file 1 succeeds
      .mockRejectedValueOnce(new Error("blob upload failed")); // file 2 fails
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [
        { path: "src/a.ts", type: "modified", content: "// a" },
        { path: "src/b.ts", type: "modified", content: "// b" },
      ],
      "two file commit", "main"
    );
 
    expect(result.success).toBe(false);
    // The branch ref must NOT have moved — no partial commit
    expect(mockGitHubClient.updateRef).not.toHaveBeenCalled();
  });
 
  it("createTreeDirect fails: commit and updateRef are never called", async () => {
    // RATIONALE: All blobs uploaded, but tree creation fails. A commit without
    // a valid tree SHA would be malformed. Neither createCommit nor updateRef
    // should fire.
    mockToken();
    setupBranchAndTree();
    mockGitHubClient.createBlob.mockResolvedValue({ sha: "blob-sha" });
    mockGitHubClient.createTreeDirect.mockRejectedValue(new Error("tree creation failed"));
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "src/a.ts", type: "modified", content: "// a" }],
      "msg", "main"
    );
 
    expect(result.success).toBe(false);
    expect(mockGitHubClient.createCommit).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateRef).not.toHaveBeenCalled();
  });
 
  it("createCommit fails: updateRef is never called (branch stays on old commit)", async () => {
    // RATIONALE: This is the most dangerous partial failure — the tree object
    // exists in GitHub's object store but the branch doesn't advance. The old
    // HEAD is preserved; the tree is an orphan. updateRef must not fire.
    mockToken();
    setupBranchAndTree();
    mockGitHubClient.createBlob.mockResolvedValue({ sha: "blob-sha" });
    mockGitHubClient.createTreeDirect.mockResolvedValue({ sha: "new-tree-sha" });
    mockGitHubClient.createCommit.mockRejectedValue(new Error("commit creation failed"));
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "src/a.ts", type: "modified", content: "// a" }],
      "msg", "main"
    );
 
    expect(result.success).toBe(false);
    // Branch must still point to old commit — updateRef must not have fired
    expect(mockGitHubClient.updateRef).not.toHaveBeenCalled();
  });
 
  it("updateRef fails after commit is created: returns error with raw message", async () => {
    // RATIONALE: Worst-case scenario — commit object exists in GitHub but the
    // branch pointer wasn't updated. The action must surface this clearly so
    // the caller knows the commit is dangling and can retry or alert the user.
    mockToken();
    setupBranchAndTree();
    mockGitHubClient.createBlob.mockResolvedValue({ sha: "blob-sha" });
    mockGitHubClient.createTreeDirect.mockResolvedValue({ sha: "tree-sha" });
    mockGitHubClient.createCommit.mockResolvedValue({ sha: "dangling-commit-sha" });
    mockGitHubClient.updateRef.mockRejectedValue(new Error("ref update failed"));
 
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "src/a.ts", type: "modified", content: "// a" }],
      "msg", "main"
    );
 
    expect(result.success).toBe(false);
    // Must surface the raw error so the caller can diagnose / retry
    expect((result as any).error).toMatch(/ref update failed/);
  });
});
 

describe("Path traversal — malicious path inputs", () => {
  it("createFileInGitHub with traversal path passes through to GitHubClient without sanitisation", async () => {
    // RATIONALE: This documents the CURRENT VULNERABILITY. The action does
    // zero path validation. A caller can supply '../../etc/passwd' and it
    // reaches GitHubClient verbatim. This test should be updated to expect
    // { success:false, error: /invalid path/ } once server-side validation
    // is added.
    mockToken();
    mockGitHubClient.createFile.mockResolvedValue({ commit: "c", content: { sha: "s" } });
 
    const result = await createFileInGitHub(
      "alice", "repo", "../../etc/passwd", "malicious", "pwn"
    );
 
    // Currently succeeds — no validation. This test is intentionally asserting
    // the broken state so a future fix is easy to verify.
    expect(result.success).toBe(true);
    expect(mockGitHubClient.createFile).toHaveBeenCalledWith(
      "alice", "repo", "../../etc/passwd", "malicious", "pwn", undefined
    );
  });
});

describe("Concurrent operations — parallel commit calls on the same branch", () => {
  it("two concurrent commits both read the same parent SHA (race condition documented)", async () => {
    // RATIONALE: Both calls read `currentCommitSha` from getBranch at the
    // same moment. Both create blobs, trees, and commits. The second updateRef
    // silently overwrites the first, causing data loss. There is no locking.
    // This test documents the race by verifying that getBranch is called twice
    // (once per concurrent request) and that updateRef is called twice,
    // meaning the second call's ref update will overwrite the first's commit.
    mockToken();
 
    // Both calls get the same stale parent — this is the race condition.
    mockGitHubClient.getBranch.mockResolvedValue({
      commit: {
        sha: "shared-parent-sha",
        commit: { tree: { sha: "shared-tree-sha" } },
      },
    });
    mockGitHubClient.getTreeEntries.mockResolvedValue([]);
    mockGitHubClient.createBlob.mockResolvedValue({ sha: "blob-sha" });
    mockGitHubClient.createTreeDirect.mockResolvedValue({ sha: "new-tree-sha" });
    // Each concurrent call creates its own commit object
    mockGitHubClient.createCommit
      .mockResolvedValueOnce({ sha: "commit-from-user-A" })
      .mockResolvedValueOnce({ sha: "commit-from-user-B" });
    mockGitHubClient.updateRef.mockResolvedValue({});
    mockGitHubClient.getRepoTree.mockResolvedValue([]);
    mockGitHubClient.getFileContent.mockResolvedValue("");
 
    const [resultA, resultB] = await Promise.all([
      commitAllChangesToGitHub("alice", "repo",
        [{ path: "src/a.ts", type: "modified", content: "// user A edit" }],
        "user A commit", "main"),
      commitAllChangesToGitHub("alice", "repo",
        [{ path: "src/b.ts", type: "modified", content: "// user B edit" }],
        "user B commit", "main"),
    ]);
 
    // Both calls "succeed" from their own perspective...
    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
 
    // ...but getBranch was called twice with the SAME stale SHA — race exists.
    expect(mockGitHubClient.getBranch).toHaveBeenCalledTimes(2);
 
    // Both updateRef calls fired — second silently overwrites first.
    expect(mockGitHubClient.updateRef).toHaveBeenCalledTimes(2);
 
    const refShas = mockGitHubClient.updateRef.mock.calls.map((c: any) => c[3]);
    expect(refShas).toContain("commit-from-user-A");
    expect(refShas).toContain("commit-from-user-B");
    // The winner is whichever resolved last — user A's changes may be lost.
  });
});

describe("Large file handling", () => {
  it("file at GitHub's 100MB blob limit causes createBlob to reject, returns success:false", async () => {
    // RATIONALE: GitHub rejects blobs > 100MB. The action must propagate this
    // as a clean failure rather than hanging or crashing the process.
    mockToken();
    setupBranchAndTree();
 
    mockGitHubClient.createBlob.mockRejectedValue(
      new Error("blob is too large (max size is 100MB)")
    );
 
    // Build a content string that represents a ~100MB file size scenario.
    // We don't actually allocate 100MB in tests — we just verify the error path.
    const result = await commitAllChangesToGitHub(
      "alice", "repo",
      [{ path: "huge.bin", type: "created", content: "x".repeat(1000) }],
      "add huge file", "main"
    );
 
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/too large/i);
    expect(mockGitHubClient.updateRef).not.toHaveBeenCalled();
  });
});