import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubClient } from "../github-client";
// Helper: build a fake Octokit instance whose sub-namespaces are all vi.fn(),contains all functions from github api which we are mocking 
function buildMockOctokit() {
  return {
    repos: {
      listForAuthenticatedUser: vi.fn(),
      get: vi.fn(),
      getBranch: vi.fn(),
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      deleteFile: vi.fn(),
      createForAuthenticatedUser: vi.fn(),
    },
    git: {
      getRef: vi.fn(),
      createRef: vi.fn(),
      updateRef: vi.fn(),
      getTree: vi.fn(),
      createTree: vi.fn(),
      createBlob: vi.fn(),
      createCommit: vi.fn(),
      getCommit: vi.fn(),
    },
    users: {
      getAuthenticated: vi.fn(),
    },
  };
}

/** Returns a client with a fresh mock Octokit injected. */
function makeClient() {
  const client = new GitHubClient("fake-token");
  const mock = buildMockOctokit();
  (client as any).octokit = mock;
  return { client, mock };
}

describe("GitHubClient.getRepositories", () => {
  it("maps Octokit response to GitHubRepo shape", async () => {
    const { client, mock } = makeClient();
    mock.repos.listForAuthenticatedUser.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "my-repo",
          full_name: "alice/my-repo",
          description: "A repo",
          private: false,
          default_branch: "main",
          updated_at: "2024-01-01",
        },
      ],
    });
 
    const result = await client.getRepositories();
 
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      name: "my-repo",
      full_name: "alice/my-repo",
      private: false,
      default_branch: "main",
    });
  });
 
  it("passes sort=updated and per_page=100 to Octokit", async () => {
    const { client, mock } = makeClient();
    mock.repos.listForAuthenticatedUser.mockResolvedValue({ data: [] });
 
    await client.getRepositories();
 
    expect(mock.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
      sort: "updated",
      per_page: 100,
    });
  });
 
  it("wraps Octokit errors with a descriptive message", async () => {
    const { client, mock } = makeClient();
    mock.repos.listForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Bad credentials"), { status: 401 })
    );
 
    await expect(client.getRepositories()).rejects.toThrow(
      "Failed to fetch repositories: Bad credentials"
    );
  });
});

describe("GitHubClient.getFileContent", () => {
  it("decodes base64 content correctly", async () => {
    const { client, mock } = makeClient();
    const raw = "export const x = 1;";
    const encoded = Buffer.from(raw).toString("base64");
    // we are faking the Octokit response for a file content request, which normally includes a base64-encoded content field and a sha
    mock.repos.getContent.mockResolvedValue({
      data: { type: "file", content: encoded, sha: "abc" },
    });
 
    const content = await client.getFileContent("owner", "repo", "src/x.ts");
    expect(content).toBe(raw);
  });
 
  it("throws when path points to a directory (array response)", async () => {
    const { client, mock } = makeClient();
    mock.repos.getContent.mockResolvedValue({ data: [] }); // directory listing
 
    await expect(
      client.getFileContent("owner", "repo", "src/")
    ).rejects.toThrow("Path is not a file");
  });
 
  it("passes branch as ref to Octokit", async () => {
    const { client, mock } = makeClient();
    mock.repos.getContent.mockResolvedValue({
      data: { type: "file", content: Buffer.from("x").toString("base64"), sha: "s" },
    });
 
    await client.getFileContent("owner", "repo", "README.md", "feature/x");
 
    expect(mock.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "feature/x" })
    );
  });
 
  it("wraps Octokit errors with a descriptive message", async () => {
    const { client, mock } = makeClient();
    mock.repos.getContent.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 })
    );
 
    await expect(
      client.getFileContent("owner", "repo", "missing.ts")
    ).rejects.toThrow("Failed to fetch file content: Not Found");
  });
});

describe("GitHubClient.updateFile", () => {
  it("base64-encodes content before sending to Octokit", async () => {
    const { client, mock } = makeClient();
    mock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "commit-sha" }, content: { sha: "file-sha" } },
    });
 
    await client.updateFile("owner", "repo", "README.md", "hello", "update readme", "old-sha");
 
    const call = mock.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(call.content).toBe(Buffer.from("hello").toString("base64"));
  });
 
  it("passes sha to Octokit (required for updates)", async () => {
    const { client, mock } = makeClient();
    mock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "c" }, content: { sha: "f" } },
    });
 
    await client.updateFile("o", "r", "f.ts", "code", "msg", "existing-sha", "main");
 
    expect(mock.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "existing-sha", branch: "main" })
    );
  });
 
  it("returns commit and content sha on success", async () => {
    const { client, mock } = makeClient();
    mock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "commit-abc" }, content: { sha: "file-xyz" } },
    });
 
    const result = await client.updateFile("o", "r", "f.ts", "code", "msg");
    expect(result).toEqual({ commit: "commit-abc", content: { sha: "file-xyz" } });
  });
});

describe("GitHubClient.createFile", () => {
  it("throws when file already exists (pathExists returns true)", async () => {
    const { client, mock } = makeClient();
    // pathExists calls getContent — 200 means it exists
    mock.repos.getContent.mockResolvedValue({ data: { type: "file" } });
 
    await expect(
      client.createFile("o", "r", "existing.ts", "content", "msg")
    ).rejects.toThrow("File already exists");
  });
 
  it("creates file when it does not exist", async () => {
    const { client, mock } = makeClient();
    // pathExists: 404 → doesn't exist
    mock.repos.getContent.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 })
    );
    mock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "c" }, content: { sha: "f" } },
    });
 
    const result = await client.createFile("o", "r", "new.ts", "// new", "add file");
    expect(result).toMatchObject({ commit: "c", content: { sha: "f" } });
  });
 
  it("base64-encodes content when creating", async () => {
    const { client, mock } = makeClient();
    mock.repos.getContent.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    mock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "c" }, content: { sha: "f" } },
    });
 
    await client.createFile("o", "r", "new.ts", "hello", "msg");
 
    const call = mock.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(call.content).toBe(Buffer.from("hello").toString("base64"));
  });
});

describe("GitHubClient.deleteFile", () => {
  it("calls Octokit deleteFile with correct params", async () => {
    const { client, mock } = makeClient();
    mock.repos.deleteFile.mockResolvedValue({});
 
    await client.deleteFile("owner", "repo", "old.ts", "remove it", "file-sha", "main");
 
    expect(mock.repos.deleteFile).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: "old.ts",
      message: "remove it",
      sha: "file-sha",
      branch: "main",
    });
  });
 
  it("wraps Octokit errors with a descriptive message", async () => {
    const { client, mock } = makeClient();
    mock.repos.deleteFile.mockRejectedValue(new Error("Reference does not exist"));
 
    await expect(
      client.deleteFile("o", "r", "f.ts", "msg", "sha")
    ).rejects.toThrow("Failed to delete file: Reference does not exist");
  });
});
describe("GitHubClient.getBranch", () => {
  it("returns branch data on success", async () => {
    const { client, mock } = makeClient();
    const branchData = {
      commit: { sha: "commit-sha", commit: { tree: { sha: "tree-sha" } } },
    };
    mock.repos.getBranch.mockResolvedValue({ data: branchData });
 
    const result = await client.getBranch("owner", "repo", "main");
    expect(result).toEqual(branchData);
  });
 
  it("wraps Octokit errors with a descriptive message", async () => {
    const { client, mock } = makeClient();
    mock.repos.getBranch.mockRejectedValue(new Error("Branch not found"));
 
    await expect(client.getBranch("o", "r", "ghost")).rejects.toThrow(
      "Failed to get branch: Branch not found"
    );
  });
});
describe("GitHubClient.createBlob", () => {
  it("passes content and encoding to Octokit and returns data", async () => {
    const { client, mock } = makeClient();
    mock.git.createBlob.mockResolvedValue({ data: { sha: "blob-sha", url: "u" } });
 
    const result = await client.createBlob("o", "r", "dGVzdA==", "base64");
 
    expect(mock.git.createBlob).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      content: "dGVzdA==",
      encoding: "base64",
    });
    expect(result.sha).toBe("blob-sha");
  });
});
describe("GitHubClient.createCommit", () => {
  it("calls Octokit with correct commit fields", async () => {
    const { client, mock } = makeClient();
    mock.git.createCommit.mockResolvedValue({
      data: { sha: "new-commit-sha" },
    });
 
    const result = await client.createCommit("owner", "repo", {
      message: "feat: add feature",
      tree: "tree-sha",
      parents: ["parent-sha"],
    });
 
    expect(mock.git.createCommit).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      message: "feat: add feature",
      tree: "tree-sha",
      parents: ["parent-sha"],
    });
    expect(result.sha).toBe("new-commit-sha");
  });
});
describe("GitHubClient.updateRef", () => {
  it("calls Octokit updateRef with force=false (prevents force-push)", async () => {
    const { client, mock } = makeClient();
    mock.git.updateRef.mockResolvedValue({ data: {} });
 
    await client.updateRef("owner", "repo", "heads/main", "new-commit-sha");
 
    expect(mock.git.updateRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "heads/main",
      sha: "new-commit-sha",
      force: false,
    });
  });
});

describe("GitHubClient.deleteMultipleFiles", () => {
  it("executes the full 4-step batch delete: getRef → getCommit → createTree → createCommit → updateRef", async () => {
    const { client, mock } = makeClient();
 
    mock.git.getRef.mockResolvedValue({ data: { object: { sha: "latest-commit" } } });
    mock.git.getCommit.mockResolvedValue({ data: { tree: { sha: "base-tree" } } });
    mock.git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    mock.git.createCommit.mockResolvedValue({ data: { sha: "new-commit" } });
    mock.git.updateRef.mockResolvedValue({ data: {} });
 
    await client.deleteMultipleFiles(
      "owner",
      "repo",
      [{ path: "old/file.ts", sha: "file-sha" }],
      "remove old files",
      "main"
    );
 
    expect(mock.git.getRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/main" })
    );
    // Tree entries use sha: null to signal deletion
    const treeCall = mock.git.createTree.mock.calls[0][0];
    expect(treeCall.tree[0]).toMatchObject({ path: "old/file.ts", sha: null });
    expect(mock.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "new-commit" })
    );
  });
 
  it("wraps Octokit errors with a descriptive message", async () => {
    const { client, mock } = makeClient();
    mock.git.getRef.mockRejectedValue(new Error("network error"));
 
    await expect(
      client.deleteMultipleFiles("o", "r", [], "msg", "main")
    ).rejects.toThrow("Failed to delete multiple files : network error");
  });
});
describe("GitHubClient.getRepoTree", () => {
  it("fetches default branch when no branch is provided", async () => {
    const { client, mock } = makeClient();
    mock.repos.get.mockResolvedValue({ data: { default_branch: "develop" } });
    mock.git.getTree.mockResolvedValue({
      data: {
        tree: [{ path: "README.md", type: "blob", sha: "s", size: 10, url: "u" }],
      },
    });
 
    await client.getRepoTree("owner", "repo");
 
    expect(mock.repos.get).toHaveBeenCalledWith({ owner: "owner", repo: "repo" });
    expect(mock.git.getTree).toHaveBeenCalledWith(
      expect.objectContaining({ tree_sha: "develop" })
    );
  });
 
  it("maps blob entries to type='file' and tree entries to type='dir'", async () => {
    const { client, mock } = makeClient();
    mock.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: "src/index.ts", type: "blob", sha: "a", size: 100, url: "u1" },
          { path: "src", type: "tree", sha: "b", size: 0, url: "u2" },
        ],
      },
    });
 
    const result = await client.getRepoTree("owner", "repo", "main");
 
    expect(result.find((f: any) => f.path === "src/index.ts")?.type).toBe("file");
    expect(result.find((f: any) => f.path === "src")?.type).toBe("dir");
  });
});
 