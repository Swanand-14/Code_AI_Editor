import { describe, it, expect, beforeEach } from "vitest";
import { useGitWorkspace, initialState, type GitHubFile } from "../Usegitworkspace";

const makeFile = (path: string, content = "", sha = "abc123"): GitHubFile => ({
  name: path.split("/").pop()!,
  path,
  sha,
  size: content.length,
  type: "file",
  content,
});

const FIXTURE_FILES: GitHubFile[] = [
  makeFile("src/components/Button.tsx", "export function Button() {}", "sha-btn"),
  makeFile("src/components/Input.tsx", "export function Input() {}", "sha-input"),
  makeFile("src/hooks/usePlayground.ts", "export function usePlayground() {}", "sha-hook"),
  makeFile("package.json", '{"name":"my-app","version":"1.0.0"}', "sha-pkg"),
];

function resetStore() {
  useGitWorkspace.setState({
    ...initialState,
    branchWorkspaces: new Map(),
  });
}

function seedStore(files = FIXTURE_FILES, branch = "main") {
  useGitWorkspace.getState().initializeWorkspace("owner/repo", branch, files);
}

describe("initializeWorkspace",()=>{
    beforeEach(resetStore);
    it("sets files owner,repo,and branch correctly",()=>{
        seedStore();
        const s = useGitWorkspace.getState();
        expect(s.repoFullName).toBe("owner/repo");
        expect(s.owner).toBe("owner");
        expect(s.repo).toBe("repo");
        expect(s.currentBranch).toBe("main");
        expect(s.files).toHaveLength(4);
    });

    it("builds remoteState map from file contents",()=>{
        seedStore();
    const { remoteState } = useGitWorkspace.getState();
 
    expect(remoteState.get("src/components/Button.tsx")).toBe("export function Button() {}");
    expect(remoteState.get("package.json")).toBe('{"name":"my-app","version":"1.0.0"}');
    })

    it("does NOT put dir-type entries into remoteState", () => {
    // RATIONALE: GitHub returns both files and dirs. Only files have content.
    // Dirs in remoteState would pollute the diff logic.
    const filesWithDir: GitHubFile[] = [
      ...FIXTURE_FILES,
      { name: "src", path: "src", sha: "", size: 0, type: "dir" },
    ];
    seedStore(filesWithDir);
 
    const { remoteState } = useGitWorkspace.getState();
    expect(remoteState.has("src")).toBe(false);
  });

  it("clears all change Sets on init — no leftover state from previous session", () => {
    // RATIONALE: The user commits, then opens a new repo without a page reload.
    // All change tracking must be completely reset.
    seedStore();
 
    // Dirty the store
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
    useGitWorkspace.getState().markFileDeleted("package.json");
 
    // Re-initialize (simulates opening a different repo)
    useGitWorkspace.getState().initializeWorkspace("owner/other-repo", "main", FIXTURE_FILES);
 
    const { createdFiles, deletedFiles, modifiedFiles } = useGitWorkspace.getState();
    expect(createdFiles.size).toBe(0);
    expect(deletedFiles.size).toBe(0);
    expect(modifiedFiles.size).toBe(0);
  });
  it("clears open files on re-init", () => {
    seedStore();
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    expect(useGitWorkspace.getState().openFiles).toHaveLength(1);
 
    // Re-init
    seedStore();
    expect(useGitWorkspace.getState().openFiles).toHaveLength(0);
    expect(useGitWorkspace.getState().activeFilePath).toBeNull();
  });
  it("sets isSwitchingBranch to false after init completes", () => {
    useGitWorkspace.getState().beginBranchSwitch("feature/new");
    expect(useGitWorkspace.getState().isSwitchingBranch).toBe(true);
 
    // initializeWorkspace is what the app calls after fetching the new branch
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "feature/new", FIXTURE_FILES);
    expect(useGitWorkspace.getState().isSwitchingBranch).toBe(false);
  });
})

describe("openFile",()=>{
    beforeEach(() => { resetStore(); seedStore(); });
    it("adds file to openFiles and sets it as active", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    const { openFiles, activeFilePath } = useGitWorkspace.getState();
 
    expect(openFiles).toHaveLength(1);
    expect(activeFilePath).toBe("src/components/Button.tsx");
  });

  it("uses remoteState content — not stale file object content", () => {
    // RATIONALE: This is a subtle but real bug. If the file object has old
    // content (from a previous fetch) but remoteState has fresh content,
    // openFile must use remoteState. Otherwise the editor shows stale data.
    const staleFile = makeFile("src/components/Button.tsx", "// STALE CONTENT", "sha-btn");
 
    useGitWorkspace.getState().openFile(staleFile);
 
    const opened = useGitWorkspace.getState().openFiles[0];
    // remoteState has "export function Button() {}" from seedStore
    expect(opened.content).toBe("export function Button() {}");
    expect(opened.originalContent).toBe("export function Button() {}");
  });
  it("does NOT add a duplicate tab if file is already open", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // open same file again
 
    expect(useGitWorkspace.getState().openFiles).toHaveLength(1);
  });

    it("switches active tab when opening an already-open file", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // Button.tsx active
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]); // Input.tsx active
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // back to Button.tsx
 
    expect(useGitWorkspace.getState().activeFilePath).toBe("src/components/Button.tsx");
    expect(useGitWorkspace.getState().openFiles).toHaveLength(2); // still 2 tabs
  });
  it("does nothing when isSwitchingBranch is true", () => {
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
 
    expect(useGitWorkspace.getState().openFiles).toHaveLength(0);
  });

}
)

describe("closeFile", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("removes the file from openFiles", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]);
    useGitWorkspace.getState().closeFile("src/components/Button.tsx");
 
    const { openFiles } = useGitWorkspace.getState();
    expect(openFiles).toHaveLength(1);
    expect(openFiles[0].path).toBe("src/components/Input.tsx");
  });
 
  it("activates the last remaining tab when active file is closed", () => {
    // RATIONALE: VS Code behaviour — closing the active tab switches to the
    // previously opened tab, not null. This prevents the editor going blank.
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // Button
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]); // Input (now active)
    useGitWorkspace.getState().closeFile("src/components/Input.tsx");
 
    // Should fall back to Button.tsx
    expect(useGitWorkspace.getState().activeFilePath).toBe("src/components/Button.tsx");
  });
 
  it("sets activeFilePath to null when last tab is closed", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().closeFile("src/components/Button.tsx");
 
    expect(useGitWorkspace.getState().activeFilePath).toBeNull();
    expect(useGitWorkspace.getState().openFiles).toHaveLength(0);
  });
 
  it("does NOT change activeFilePath when closing a non-active tab", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // Button
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]); // Input (active)
 
    // Close Button while Input is active
    useGitWorkspace.getState().closeFile("src/components/Button.tsx");
 
    // Input should still be active
    expect(useGitWorkspace.getState().activeFilePath).toBe("src/components/Input.tsx");
  });
});

describe("updateFileContent", ()=>{
  beforeEach(() => { resetStore(); seedStore(); });
  it("updates content in openFiles and sets hasChanges=true when content differs", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent(
      "src/components/Button.tsx",
      "export function Button() { return <button /> }"
    );
 
    const file = useGitWorkspace.getState().openFiles[0];
    expect(file.content).toBe("export function Button() { return <button /> }");
    expect(file.hasChanges).toBe(true);
  });
   it("adds path to modifiedFiles when content differs from remoteState", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent(
      "src/components/Button.tsx",
      "// changed"
    );
 
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(true);
  });
  it("REMOVES from modifiedFiles when content reverts to original", () => {
    // RATIONALE: If the user types and then ctrl+Z back to the original content,
    // the file should no longer show as modified. Without this, the source
    // control panel shows a phantom change that doesn't exist.
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(true);
 
    // Revert to original
    useGitWorkspace.getState().updateFileContent(
      "src/components/Button.tsx",
      "export function Button() {}"
    );
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(false);
    expect(useGitWorkspace.getState().openFiles[0].hasChanges).toBe(false);
  });
   it("does NOT affect other open files when one file changes", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]); // Button
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]); // Input
 
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
 
    const input = useGitWorkspace.getState().openFiles.find(
      (f) => f.path === "src/components/Input.tsx"
    );
    expect(input?.hasChanges).toBe(false);
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Input.tsx")).toBe(false);
  });
  it("does nothing when isSwitchingBranch is true", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
 
    // Content should be unchanged (still from remoteState)
    const file = useGitWorkspace.getState().openFiles[0];
    expect(file?.hasChanges ?? false).toBe(false);
  });
})
describe("markFileDeleted — the critical branching logic", () => {
   beforeEach(() => { resetStore(); seedStore(); });
   it("adds a GitHub file (has sha) to deletedFiles", () => {
    // RATIONALE: GitHub files need to be committed as deleted.
    // They go into deletedFiles so getAllChanges() includes them.
    useGitWorkspace.getState().markFileDeleted("src/components/Button.tsx");
 
    const { deletedFiles, createdFiles } = useGitWorkspace.getState();
    expect(deletedFiles.has("src/components/Button.tsx")).toBe(true);
    expect(createdFiles.has("src/components/Button.tsx")).toBe(false);
  });
  it("removes a local-only file (in createdFiles) from createdFiles instead of adding to deletedFiles", () => {
    // RATIONALE: This is the most important branching condition in the store.
    // A local-only file was never pushed to GitHub — there's nothing to delete
    // via the API. Adding it to deletedFiles would cause the commit action to
    // try to delete a file that doesn't exist on GitHub → API error.
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
    expect(useGitWorkspace.getState().createdFiles.has("src/New.tsx")).toBe(true);
 
    // Now delete that local file
    useGitWorkspace.getState().markFileDeleted("src/New.tsx");
 
    const { deletedFiles, createdFiles } = useGitWorkspace.getState();
    expect(deletedFiles.has("src/New.tsx")).toBe(false); // NOT in deletedFiles
    expect(createdFiles.has("src/New.tsx")).toBe(false); // removed from createdFiles
  });
  it("removes a deleted file from modifiedFiles simultaneously", () => {
    // RATIONALE: A file can't be both modified and deleted.
    // If it stays in modifiedFiles, getAllChanges emits a 'modified' entry
    // for a file that's being deleted — two conflicting changes for one path.
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// edited");
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(true);
 
    useGitWorkspace.getState().markFileDeleted("src/components/Button.tsx");
 
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(false);
    expect(useGitWorkspace.getState().deletedFiles.has("src/components/Button.tsx")).toBe(true);
  });

})

describe("getAllChanges", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("returns empty array when nothing is changed", () => {
    expect(useGitWorkspace.getState().getAllChanges()).toHaveLength(0);
  });
 
  it("returns all modified + created + deleted when nothing is staged", () => {
    // Open and modify Button
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
 
    // Create a new file
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
 
    // Delete a GitHub file
    useGitWorkspace.getState().markFileDeleted("package.json");
 
    const changes = useGitWorkspace.getState().getAllChanges();
    expect(changes).toHaveLength(3);
 
    const types = changes.map((c) => c.type).sort();
    expect(types).toEqual(["created", "deleted", "modified"]);
  });
 
  it("returns ONLY staged files when staging is active", () => {
    // RATIONALE: Selective staging — the user stages only some files.
    // getAllChanges must respect the staged set, not commit everything.
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    useGitWorkspace.getState().openFile(FIXTURE_FILES[1]);
    useGitWorkspace.getState().updateFileContent("src/components/Input.tsx", "// also changed");
 
    // Stage only Button
    useGitWorkspace.getState().stageFile("src/components/Button.tsx");
 
    const changes = useGitWorkspace.getState().getAllChanges();
 
    // Only Button should be in the commit
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("src/components/Button.tsx");
    expect(changes[0].type).toBe("modified");
  });
 
  it("includes correct content for modified files", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// new content");
 
    const changes = useGitWorkspace.getState().getAllChanges();
    const modified = changes.find((c) => c.path === "src/components/Button.tsx");
 
    expect(modified?.content).toBe("// new content");
    expect(modified?.type).toBe("modified");
  });
 
  it("includes correct content for created files", () => {
    useGitWorkspace.getState().markFileCreated("src/New.tsx", "// new file content");
 
    const changes = useGitWorkspace.getState().getAllChanges();
    const created = changes.find((c) => c.path === "src/New.tsx");
 
    expect(created?.type).toBe("created");
    expect(created?.content).toBe("// new file content");
  });
 
  it("does not include the same path twice", () => {
    // RATIONALE: If there's a bug in the Sets, a file could appear in both
    // modifiedFiles and createdFiles. That would produce two entries for the
    // same path in getAllChanges — which causes a GitHub API conflict error.
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
 
    const changes = useGitWorkspace.getState().getAllChanges();
    const paths = changes.map((c) => c.path);
    const uniquePaths = new Set(paths);
 
    expect(paths.length).toBe(uniquePaths.size);
  });

});

describe("discardFileChanges", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("restores modified file content to remoteState original", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// dirty");
 
    useGitWorkspace.getState().discardFileChanges("src/components/Button.tsx");
 
    const file = useGitWorkspace.getState().openFiles[0];
    expect(file.content).toBe("export function Button() {}");
    expect(file.hasChanges).toBe(false);
    expect(useGitWorkspace.getState().modifiedFiles.has("src/components/Button.tsx")).toBe(false);
  });
  it("removes a created file from the tree and openFiles", () => {
    // RATIONALE: A locally created file has no original — discarding it means
    // it never existed. It must be removed from files[], openFiles[], and createdFiles.
    useGitWorkspace.getState().addFileToTree(makeFile("src/New.tsx", "", ""));
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
    useGitWorkspace.getState().openFile(makeFile("src/New.tsx", "", ""));
 
    useGitWorkspace.getState().discardFileChanges("src/New.tsx");
 
    const { files, openFiles, createdFiles } = useGitWorkspace.getState();
    expect(files.some((f) => f.path === "src/New.tsx")).toBe(false);
    expect(openFiles.some((f) => f.path === "src/New.tsx")).toBe(false);
    expect(createdFiles.has("src/New.tsx")).toBe(false);
  });
  it("re-adds a deleted GitHub file back to the tree", () => {
    // RATIONALE: The user staged package.json for deletion, then changed their
    // mind. discardFileChanges must restore the file to the tree.
    useGitWorkspace.getState().removeFileFromTree("package.json");
    useGitWorkspace.getState().markFileDeleted("package.json");
 
    useGitWorkspace.getState().discardFileChanges("package.json");
 
    const { files, deletedFiles } = useGitWorkspace.getState();
    expect(deletedFiles.has("package.json")).toBe(false);
    expect(files.some((f) => f.path === "package.json")).toBe(true);
  });
  it("handles discarding a file that is NOT open (not in openFiles)", () => {
    // RATIONALE: The source control panel allows discarding files that
    // aren't currently open in the editor. This must not crash.
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// change");
 
    // Button is NOT in openFiles (never opened)
    // This should be a no-op / graceful handling
    expect(() => {
      useGitWorkspace.getState().discardFileChanges("src/components/Button.tsx");
    }).not.toThrow();
  });
})

describe("branch switching — beginBranchSwitch + initializeWorkspace", () => {
  beforeEach(resetStore);
  it("preserves main branch workspace when switching to feature branch", () => {
    // RATIONALE: The user has unsaved work on main, then switches to a feature
    // branch to review something. When they switch back, their work must be there.
    // The branchWorkspaces Map is the persistence layer for this.
 
    // Set up main branch with some work
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "main", FIXTURE_FILES);
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// work in progress");
 
    // Switch to feature branch
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "feature/x", FIXTURE_FILES);
 
    // Verify feature branch has clean state
    expect(useGitWorkspace.getState().modifiedFiles.size).toBe(0);
    expect(useGitWorkspace.getState().currentBranch).toBe("feature/x");
 
    // The main branch workspace is preserved in the Map
    const mainWorkspace = useGitWorkspace.getState().branchWorkspaces.get("main");
    expect(mainWorkspace?.modifiedFiles.has("src/components/Button.tsx")).toBe(true);
  });
    it("sets isSwitchingBranch=true immediately on beginBranchSwitch", () => {
    // RATIONALE: isSwitchingBranch guards all store actions.
    // Any action called during the loading window (between beginBranchSwitch
    // and initializeWorkspace completing) must be dropped. This checks the
    // guard is activated immediately.
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "main", FIXTURE_FILES);
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
 
    expect(useGitWorkspace.getState().isSwitchingBranch).toBe(true);
  });
  it("drops all actions while isSwitchingBranch is true", () => {
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "main", FIXTURE_FILES);
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
 
    // All of these should be silently dropped
    useGitWorkspace.getState().markFileCreated("src/Dropped.tsx");
    useGitWorkspace.getState().markFileDeleted("package.json");
    useGitWorkspace.getState().addFileToTree(makeFile("src/Dropped.tsx"));
 
    expect(useGitWorkspace.getState().createdFiles.size).toBe(0);
    expect(useGitWorkspace.getState().deletedFiles.size).toBe(0);
  });
  it("switches back to the correct workspace state when re-visiting main", () => {
    // Full round-trip: main → feature → main
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "main", FIXTURE_FILES);
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// my work");
 
    // Go to feature
    useGitWorkspace.getState().beginBranchSwitch("feature/x");
    useGitWorkspace.getState().initializeWorkspace("owner/repo", "feature/x", FIXTURE_FILES);
    expect(useGitWorkspace.getState().modifiedFiles.size).toBe(0);
 
    // Come back to main — beginBranchSwitch restores from branchWorkspaces Map
    useGitWorkspace.getState().beginBranchSwitch("main");
 
    const { modifiedFiles, currentBranch } = useGitWorkspace.getState();
    expect(currentBranch).toBe("main");
    // The main workspace had Button.tsx modified
    expect(modifiedFiles.has("src/components/Button.tsx")).toBe(true);
  });
})

describe("staging — stageFile / unstageFile / stageAllFiles", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("stageFile adds a path to stagedFiles", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    useGitWorkspace.getState().stageFile("src/components/Button.tsx");
 
    expect(useGitWorkspace.getState().stagedFiles.has("src/components/Button.tsx")).toBe(true);
  });
 
  it("unstageFile removes the path from stagedFiles", () => {
    useGitWorkspace.getState().stageFile("src/components/Button.tsx");
    useGitWorkspace.getState().unstageFile("src/components/Button.tsx");
 
    expect(useGitWorkspace.getState().stagedFiles.has("src/components/Button.tsx")).toBe(false);
  });
 
  it("stageAllFiles stages every modified + created + deleted file", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
    useGitWorkspace.getState().markFileDeleted("package.json");
 
    useGitWorkspace.getState().stageAllFiles();
 
    const { stagedFiles } = useGitWorkspace.getState();
    expect(stagedFiles.has("src/components/Button.tsx")).toBe(true);
    expect(stagedFiles.has("src/New.tsx")).toBe(true);
    expect(stagedFiles.has("package.json")).toBe(true);
  });
 
  it("unstageAllFiles clears the stagedFiles Set", () => {
    useGitWorkspace.getState().stageAllFiles();
    useGitWorkspace.getState().unstageAllFiles();
 
    expect(useGitWorkspace.getState().stagedFiles.size).toBe(0);
  });
 
  it("hasStagedChanges returns true only when stagedFiles is non-empty", () => {
    expect(useGitWorkspace.getState().hasStagedChanges()).toBe(false);
 
    useGitWorkspace.getState().stageFile("some/path.ts");
    expect(useGitWorkspace.getState().hasStagedChanges()).toBe(true);
  });
})

describe("addFileToTree / removeFileFromTree / updateFileInTree", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("addFileToTree appends the file to files[]", () => {
    const newFile = makeFile("src/New.tsx", "// new", "");
    useGitWorkspace.getState().addFileToTree(newFile);
 
    expect(useGitWorkspace.getState().files).toHaveLength(FIXTURE_FILES.length + 1);
    expect(useGitWorkspace.getState().files.some((f) => f.path === "src/New.tsx")).toBe(true);
  });
 
  it("removeFileFromTree removes exactly one file", () => {
    useGitWorkspace.getState().removeFileFromTree("package.json");
 
    const { files } = useGitWorkspace.getState();
    expect(files).toHaveLength(FIXTURE_FILES.length - 1);
    expect(files.some((f) => f.path === "package.json")).toBe(false);
  });
 
  it("removeFileFromTree does not affect other files", () => {
    useGitWorkspace.getState().removeFileFromTree("package.json");
 
    const { files } = useGitWorkspace.getState();
    expect(files.some((f) => f.path === "src/components/Button.tsx")).toBe(true);
    expect(files.some((f) => f.path === "src/hooks/usePlayground.ts")).toBe(true);
  });
 
  it("updateFileInTree updates only the target file", () => {
    useGitWorkspace.getState().updateFileInTree("package.json", {
      content: '{"name":"updated"}',
      sha: "new-sha",
    });
 
    const pkg = useGitWorkspace.getState().files.find((f) => f.path === "package.json");
    expect(pkg?.content).toBe('{"name":"updated"}');
    expect(pkg?.sha).toBe("new-sha");
 
    // Other files untouched
    const btn = useGitWorkspace.getState().files.find((f) => f.path === "src/components/Button.tsx");
    expect(btn?.sha).toBe("sha-btn");
  });
});

describe("hasUnsavedChanges", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("returns false when store is clean", () => {
    expect(useGitWorkspace.getState().hasUnsavedChanges()).toBe(false);
  });
 
  it("returns true when there are modified files", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    expect(useGitWorkspace.getState().hasUnsavedChanges()).toBe(true);
  });
 
  it("returns true when there are created files", () => {
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
    expect(useGitWorkspace.getState().hasUnsavedChanges()).toBe(true);
  });
 
  it("returns true when there are deleted files", () => {
    useGitWorkspace.getState().markFileDeleted("package.json");
    expect(useGitWorkspace.getState().hasUnsavedChanges()).toBe(true);
  });
 
  it("returns false after discardAllChanges", () => {
    useGitWorkspace.getState().openFile(FIXTURE_FILES[0]);
    useGitWorkspace.getState().updateFileContent("src/components/Button.tsx", "// changed");
    useGitWorkspace.getState().markFileCreated("src/New.tsx");
 
    useGitWorkspace.getState().discardAllChanges();
 
    expect(useGitWorkspace.getState().hasUnsavedChanges()).toBe(false);
  });
});