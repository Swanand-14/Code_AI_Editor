import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFileExplorer, initialState } from "../useFileExplorer";
import { generateFileId, enrichTemplateWithPaths } from "../../lib";
import type { TemplateFile, TemplateFolder } from "../../lib/path-to-json";

const mockSave = vi.fn().mockResolvedValue({});
const nullInstance = null; // store gracefully skips fs calls when instance is null

function makeFile(
  filename: string,
  fileExtension: string,
  path: string,
  content = ""
): TemplateFile {
  return {
    id: `db-id-${filename}`,
    filename,
    fileExtension,
    content,
    path,
    playgroundId: "pg-001",
    folderId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

function makeFolder(
  folderName: string,
  items: Array<TemplateFile | TemplateFolder> = []
): TemplateFolder {
  return {
    folderName,
    items,
    playgroundId: "pg-001",
    parentFolderId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

function buildFixture(): TemplateFolder {
  const raw: TemplateFolder = {
    folderName: "root",
    playgroundId: "pg-001",
    parentFolderId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    items: [
      makeFolder("src", [
        makeFolder("components", [
          makeFile("Button", "tsx", "src/components", "export function Button() {}"),
          makeFile("Input", "tsx", "src/components", "export function Input() {}"),
        ]),
        makeFolder("hooks", [
          makeFile("usePlayground", "ts", "src/hooks", "export function usePlayground() {}"),
        ]),
      ]),
      makeFile("package", "json", "", '{"name":"my-app"}'),
    ],
  };
  // enrichTemplateWithPaths mirrors what your app does on load
  // It sets path="" on root-level files, "src" on src/ files, etc.
  return enrichTemplateWithPaths(raw);
}

function resetStore() {
  useFileExplorer.setState({ ...initialState });
  mockSave.mockClear();
}
 
function seedStore() {
  useFileExplorer.setState({ templateData: buildFixture() });
}
 
// Get a file's ID the same way the store does — using the real generateFileId
function getFileId(filename: string, ext: string, path: string): string {
  const { templateData } = useFileExplorer.getState();
  const file = makeFile(filename, ext, path);
  return generateFileId(file, templateData!);
}
 
// Count all TemplateFile nodes recursively — detects phantom nodes
function countFiles(folder: TemplateFolder): number {
  return folder.items.reduce((acc, item) => {
    if ("folderName" in item) return acc + countFiles(item);
    return acc + 1;
  }, 0);
}
 
// Collect all file paths recursively — detects duplicates
function collectPaths(folder: TemplateFolder, base = ""): string[] {
  const paths: string[] = [];
  for (const item of folder.items) {
    if ("folderName" in item) {
      const sub = base ? `${base}/${item.folderName}` : item.folderName;
      paths.push(...collectPaths(item, sub));
    } else {
      const p = base
        ? `${base}/${item.filename}.${item.fileExtension}`
        : `${item.filename}.${item.fileExtension}`;
      paths.push(p);
    }
  }
  return paths;
}
//testing -:
describe("openFile", () => {
    beforeEach(() => { resetStore(); seedStore(); });
 
  it("adds file to openFiles and sets it as active", () => {
    const { templateData } = useFileExplorer.getState();
    const buttonFile = makeFile("Button", "tsx", "src/components", "export function Button() {}");
 
    useFileExplorer.getState().openFile(buttonFile);
 
    const { openFiles, activeFileId } = useFileExplorer.getState();
    expect(openFiles).toHaveLength(1);
    expect(activeFileId).toBe(generateFileId(buttonFile, templateData!));
  });

   it("uses content from templateData, not from the stale file object passed in", () => {
    // RATIONALE: The file object passed to openFile might be from a click handler
    // that captured the file at render time. If the file was edited since then,
    // the stale object has old content. openFile must always read from templateData.
    const staleFile = makeFile("Button", "tsx", "src/components", "// STALE CONTENT");
 
    useFileExplorer.getState().openFile(staleFile);
 
    const opened = useFileExplorer.getState().openFiles[0];
    // templateData has "export function Button() {}" from the fixture
    expect(opened.content).toBe("export function Button() {}");
    expect(opened.originalContent).toBe("export function Button() {}");
  });
  it("opens files with the same name from different folders as separate tabs", () => {
    // RATIONALE: This is the classic duplicate-filename bug.
    // Two files named "index.ts" in different folders must get different IDs.
    // If generateFileId doesn't use the path, they collapse into one tab.
    const hooksFile = makeFile("usePlayground", "ts", "src/hooks");
    const rootFile = makeFile("package", "json", "");
 
    useFileExplorer.getState().openFile(hooksFile);
    useFileExplorer.getState().openFile(rootFile);
 
    expect(useFileExplorer.getState().openFiles).toHaveLength(2);
 
    const ids = useFileExplorer.getState().openFiles.map((f) => f.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it("sets hasUnsavedChanges=false on open", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    useFileExplorer.getState().openFile(buttonFile);
 
    expect(useFileExplorer.getState().openFiles[0].hasUnsavedChanges).toBe(false);
  });
})

describe("closeFile", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("removes the file from openFiles", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
    const fileId = generateFileId(buttonFile, templateData!);
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().closeFile(fileId);
 
    expect(useFileExplorer.getState().openFiles).toHaveLength(0);
  });
 
  it("falls back to the last remaining tab when active file is closed", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile); // Input is active
    useFileExplorer.getState().closeFile(generateFileId(inputFile, templateData!));
 
    // Should fall back to Button
    expect(useFileExplorer.getState().activeFileId).toBe(
      generateFileId(buttonFile, templateData!)
    );
  });
 
  it("sets activeFileId to null when last tab is closed", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().closeFile(generateFileId(buttonFile, templateData!));
 
    expect(useFileExplorer.getState().activeFileId).toBeNull();
    expect(useFileExplorer.getState().editorContent).toBe("");
  });
 
  it("does NOT change activeFileId when closing a non-active tab", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile); // Input is active
 
    useFileExplorer.getState().closeFile(generateFileId(buttonFile, templateData!));
 
    expect(useFileExplorer.getState().activeFileId).toBe(
      generateFileId(inputFile, templateData!)
    );
  });
});

describe("updateFileContent", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("updates content and marks hasUnsavedChanges=true", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
    const fileId = generateFileId(buttonFile, templateData!);
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().updateFileContent(fileId, "// edited");
 
    const file = useFileExplorer.getState().openFiles[0];
    expect(file.content).toBe("// edited");
    expect(file.hasUnsavedChanges).toBe(true);
  });
 
  it("sets hasUnsavedChanges=false when content reverts to originalContent", () => {
    // RATIONALE: User types then ctrl+Z back to original.
    // The unsaved dot in the tab must disappear.
    const buttonFile = makeFile("Button", "tsx", "src/components", "export function Button() {}");
    const { templateData } = useFileExplorer.getState();
    const fileId = generateFileId(buttonFile, templateData!);
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().updateFileContent(fileId, "// edited");
    expect(useFileExplorer.getState().openFiles[0].hasUnsavedChanges).toBe(true);
 
    // Revert to original
    useFileExplorer.getState().updateFileContent(fileId, "export function Button() {}");
    expect(useFileExplorer.getState().openFiles[0].hasUnsavedChanges).toBe(false);
  });
 
  it("updates editorContent only for the active file", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile); // Input is active
 
    // Update non-active file (Button)
    useFileExplorer.getState().updateFileContent(
      generateFileId(buttonFile, templateData!),
      "// background edit"
    );
 
    // editorContent should still reflect Input (the active file)
    expect(useFileExplorer.getState().editorContent).not.toBe("// background edit");
  });
 
  it("does not affect sibling files when one file is updated", () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile);
    useFileExplorer.getState().updateFileContent(
      generateFileId(buttonFile, templateData!),
      "// changed"
    );
 
    const input = useFileExplorer.getState().openFiles.find(
      (f) => f.id === generateFileId(inputFile, templateData!)
    );
    expect(input?.hasUnsavedChanges).toBe(false);
  });
});

describe("handleAddFile", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("adds a new file to the correct nested folder in templateData", async () => {
    const newFile = makeFile("Modal", "tsx", "src/components", "export function Modal() {}");
 
    await useFileExplorer.getState().handleAddFile(
      newFile, "src/components", async () => {}, nullInstance, mockSave
    );
 
    const { templateData } = useFileExplorer.getState();
    const paths = collectPaths(templateData!);
    expect(paths).toContain("src/components/Modal.tsx");
  });
 
  it("calls saveTemplateData exactly once", async () => {
    const newFile = makeFile("Modal", "tsx", "src/components");
    await useFileExplorer.getState().handleAddFile(
      newFile, "src/components", async () => {}, nullInstance, mockSave
    );
 
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
 
  it("auto-opens the newly created file", async () => {
    const newFile = makeFile("Modal", "tsx", "src/components", "");
    await useFileExplorer.getState().handleAddFile(
      newFile, "src/components", async () => {}, nullInstance, mockSave
    );
 
    const { openFiles } = useFileExplorer.getState();
    expect(openFiles.some((f) => f.filename === "Modal")).toBe(true);
  });
 
  it("does NOT add the file when a duplicate exists in the same folder", async () => {
    const duplicate = makeFile("Button", "tsx", "src/components"); // already exists
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
 
    await useFileExplorer.getState().handleAddFile(
      duplicate, "src/components", async () => {}, nullInstance, mockSave
    );
 
    // Tree unchanged, save never called
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore);
    expect(mockSave).not.toHaveBeenCalled();
  });
 
  it("allows same filename in a different folder (not a duplicate)", async () => {
    // Button.tsx exists in src/components — adding Button.tsx to src/hooks is valid
    const newFile = makeFile("Button", "tsx", "src/hooks", "");
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
 
    await useFileExplorer.getState().handleAddFile(
      newFile, "src/hooks", async () => {}, nullInstance, mockSave
    );
 
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore + 1);
  });
 
  it("preserves existing sibling files when adding a new one", async () => {
    const newFile = makeFile("Modal", "tsx", "src/components", "");
    await useFileExplorer.getState().handleAddFile(
      newFile, "src/components", async () => {}, nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/components/Button.tsx");
    expect(paths).toContain("src/components/Input.tsx");
  });
 
  it("adds a root-level file correctly (empty parentPath)", async () => {
    const newFile = makeFile("README", "md", "", "# My App");
    await useFileExplorer.getState().handleAddFile(
      newFile, "", async () => {}, nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("README.md");
  });
});

describe("handleDeleteFile", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("removes the file from templateData", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
 
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).not.toContain("src/components/Button.tsx");
  });
 
  it("removes EXACTLY one file — no collateral deletions", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
 
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore - 1);
  });
 
  it("preserves sibling files after delete", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/components/Input.tsx");
    expect(paths).toContain("src/hooks/usePlayground.ts");
  });
 
  it("closes the tab if the deleted file is currently open", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    useFileExplorer.getState().openFile(buttonFile);
    expect(useFileExplorer.getState().openFiles).toHaveLength(1);
 
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    expect(useFileExplorer.getState().openFiles).toHaveLength(0);
    expect(useFileExplorer.getState().activeFileId).toBeNull();
  });
 
  it("does NOT close other tabs when one file is deleted", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile);
    expect(useFileExplorer.getState().openFiles).toHaveLength(2);
 
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    expect(useFileExplorer.getState().openFiles).toHaveLength(1);
    expect(useFileExplorer.getState().openFiles[0].filename).toBe("Input");
  });
 
  it("calls saveTemplateData once", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
 
  it("leaves no duplicate paths after delete", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleDeleteFile(
      buttonFile, "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });
});
describe("handleDeleteFolder", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("removes the folder and all its files from templateData", async () => {
    const componentsFolder = makeFolder("components");
    await useFileExplorer.getState().handleDeleteFolder(
      componentsFolder, "src", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).not.toContain("src/components/Button.tsx");
    expect(paths).not.toContain("src/components/Input.tsx");
  });
 
  it("removes exactly the right number of files", async () => {
    // components/ has 2 files
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
    const componentsFolder = makeFolder("components");
 
    await useFileExplorer.getState().handleDeleteFolder(
      componentsFolder, "src", nullInstance, mockSave
    );
 
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore - 2);
  });
 
  it("preserves files in sibling folders", async () => {
    const componentsFolder = makeFolder("components");
    await useFileExplorer.getState().handleDeleteFolder(
      componentsFolder, "src", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/hooks/usePlayground.ts");
    expect(paths).toContain("package.json");
  });
 
  it("closes all open tabs from the deleted folder", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const inputFile = makeFile("Input", "tsx", "src/components");
    const hookFile = makeFile("usePlayground", "ts", "src/hooks");
 
    useFileExplorer.getState().openFile(buttonFile);
    useFileExplorer.getState().openFile(inputFile);
    useFileExplorer.getState().openFile(hookFile);
    expect(useFileExplorer.getState().openFiles).toHaveLength(3);
 
    const componentsFolder = makeFolder("components");
    await useFileExplorer.getState().handleDeleteFolder(
      componentsFolder, "src", nullInstance, mockSave
    );
 
    // Only the hook tab should remain
    const { openFiles } = useFileExplorer.getState();
    expect(openFiles).toHaveLength(1);
    expect(openFiles[0].filename).toBe("usePlayground");
  });
});

describe("handleRenameFile — the most complex action", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("updates filename and extension in templateData", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/components/PrimaryButton.tsx");
    expect(paths).not.toContain("src/components/Button.tsx");
  });
 
  it("preserves the file count — no duplication", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
 
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
 
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore);
  });
 
  it("preserves sibling files after rename", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/components/Input.tsx");
    expect(paths).toContain("src/hooks/usePlayground.ts");
    expect(paths).toContain("package.json");
  });
 
  it("updates the open tab ID when the active file is renamed", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const { templateData } = useFileExplorer.getState();
    const oldId = generateFileId(buttonFile, templateData!);
 
    useFileExplorer.getState().openFile(buttonFile);
    expect(useFileExplorer.getState().activeFileId).toBe(oldId);
 
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
 
    // The tab ID must update — old ID no longer exists
    const { openFiles, activeFileId } = useFileExplorer.getState();
    expect(openFiles.some((f) => f.id === oldId)).toBe(false);
    expect(activeFileId).not.toBe(oldId);
    // New ID reflects the new name
    expect(activeFileId).toContain("PrimaryButton");
  });
 
  it("BLOCKS rename when target name already exists in the same folder", async () => {
    // RATIONALE: Renaming Button.tsx → Input.tsx when Input.tsx already exists
    // would create two nodes with the same path. This breaks the file tree,
    // and one file silently overwrites the other in the DB.
    const buttonFile = makeFile("Button", "tsx", "src/components");
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
 
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "Input", "tsx", "src/components", nullInstance, mockSave  // Input already exists
    );
 
    // Tree must be unchanged
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore);
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths.filter((p) => p === "src/components/Input.tsx")).toHaveLength(1); // still exactly one
    expect(mockSave).not.toHaveBeenCalled();
  });
 
  it("ALLOWS rename to same name with different extension", async () => {
    // Button.tsx → Button.js is valid even though base name matches
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "Button", "js", "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    expect(paths).toContain("src/components/Button.js");
    expect(paths).not.toContain("src/components/Button.tsx");
  });
 
  it("leaves no duplicate paths after rename", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
 
    const paths = collectPaths(useFileExplorer.getState().templateData!);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });
 
  it("calls saveTemplateData exactly once on success", async () => {
    const buttonFile = makeFile("Button", "tsx", "src/components");
    await useFileExplorer.getState().handleRenameFile(
      buttonFile, "PrimaryButton", "tsx", "src/components", nullInstance, mockSave
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("handleAddFolder", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("adds a new folder inside a nested path", async () => {
    const newFolder = makeFolder("utils");
    await useFileExplorer.getState().handleAddFolder(
      newFolder, "src", nullInstance, mockSave
    );
 
    const { templateData } = useFileExplorer.getState();
    const srcFolder = templateData!.items.find(
      (item) => "folderName" in item && item.folderName === "src"
    ) as TemplateFolder;
    const utils = srcFolder?.items.find(
      (item) => "folderName" in item && item.folderName === "utils"
    );
    expect(utils).toBeDefined();
  });
 
  it("adds a root-level folder correctly (empty parentPath)", async () => {
    const newFolder = makeFolder("public");
    await useFileExplorer.getState().handleAddFolder(
      newFolder, "", nullInstance, mockSave
    );
 
    const { templateData } = useFileExplorer.getState();
    const publicFolder = templateData!.items.find(
      (item) => "folderName" in item && item.folderName === "public"
    );
    expect(publicFolder).toBeDefined();
  });
 
  it("does not affect existing files when a folder is added", async () => {
    const filesCountBefore = countFiles(useFileExplorer.getState().templateData!);
    const newFolder = makeFolder("utils");
 
    await useFileExplorer.getState().handleAddFolder(
      newFolder, "src", nullInstance, mockSave
    );
 
    expect(countFiles(useFileExplorer.getState().templateData!)).toBe(filesCountBefore);
  });
 
  it("calls saveTemplateData once", async () => {
    const newFolder = makeFolder("utils");
    await useFileExplorer.getState().handleAddFolder(
      newFolder, "src", nullInstance, mockSave
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("closeAllFiles", () => {
  beforeEach(() => { resetStore(); seedStore(); });
 
  it("clears all open tabs and resets activeFileId", () => {
    useFileExplorer.getState().openFile(makeFile("Button", "tsx", "src/components"));
    useFileExplorer.getState().openFile(makeFile("Input", "tsx", "src/components"));
    expect(useFileExplorer.getState().openFiles).toHaveLength(2);
 
    useFileExplorer.getState().closeAllFiles();
 
    expect(useFileExplorer.getState().openFiles).toHaveLength(0);
    expect(useFileExplorer.getState().activeFileId).toBeNull();
    expect(useFileExplorer.getState().editorContent).toBe("");
  });
});
 