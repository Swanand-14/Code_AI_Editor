import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { FileCreationWatcher } from "../services/fileWatcher";

interface MockWcFs {
  writeFile: Mock;
  readFile: Mock;
  mkdir: Mock;
  rm: Mock;
  readdir: Mock;
}
interface MockWcInstance {
  fs: MockWcFs;
  on: Mock;
}
 
function makeMockWc(): MockWcInstance {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(""),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
    },
    on: vi.fn(),
  };
}

interface WcSyncAdapter {
  playgroundName: string;
  /**
   * Returns a fresh mock WC and the handlers under test.
   * Handlers mirror the EXACT calls the real code makes — call signatures
   * are derived line-by-line from the source files provided.
   */
  setup(): Promise<{
    wc: MockWcInstance;
    /**
     * For normal playground content change we assert on
     * webContainerService.writeFile (the service adds the leading slash).
     * This spy is set when the adapter wraps that path; null otherwise.
     */
    serviceWriteFileSpy: Mock | null;
    handlers: {
      onContentChange(filePath: string, newContent: string): Promise<void>;
      onFileCreate(
        filePath: string,
        parentPath: string,
        content?: string
      ): Promise<void>;
      onFolderCreate(folderPath: string, parentPath: string): Promise<void>;
      onFileDelete(filePath: string): Promise<void>;
      onFolderDelete(folderPath: string): Promise<void>;
      onFileRename(
        oldPath: string,
        newPath: string,
        content?: string
      ): Promise<void>;
    };
  }>;
}
// ─── Shared suite factory ───────
function createWcSyncSuite(adapter: WcSyncAdapter) {
    describe(`[${adapter.playgroundName}] WebContainer sync`, () => {
    let wc: MockWcInstance;
    let serviceWriteFileSpy: Mock | null;
    let h: Awaited<ReturnType<WcSyncAdapter["setup"]>>["handlers"];
 
    beforeEach(async () => {
      vi.clearAllMocks();
      const result = await adapter.setup();
      wc = result.wc;
      serviceWriteFileSpy = result.serviceWriteFileSpy;
      h = result.handlers;
    });
 
    
    // OUTBOUND — content change
    
 
    describe("OUTBOUND: content change", () => {
      it("triggers exactly one write call per change", async () => {
        await h.onContentChange("src/components/Button.tsx", "// edited");
 
        // Normal playground routes through webContainerService.writeFile;
        // GitHub playgrounds call instance.fs.writeFile directly.
        if (serviceWriteFileSpy) {
  expect(serviceWriteFileSpy).toHaveBeenCalledTimes(1);
} else {
  expect(wc.fs.writeFile).toHaveBeenCalledTimes(1);
}
      });
 
      it("passes the correct file path to the write call", async () => {
        await h.onContentChange("src/components/Button.tsx", "// edited");
 
        if (serviceWriteFileSpy) {
          // Normal playground: bare path, service adds slash
          expect(serviceWriteFileSpy.mock.calls[0][0]).toBe(
            "src/components/Button.tsx"
          );
        } else {
          // GitHub playgrounds: leading slash added by component
          expect(wc.fs.writeFile.mock.calls[0][0]).toBe(
            "/src/components/Button.tsx"
          );
        }
      });
 
      it("passes the new content verbatim", async () => {
        const content = "export const x = 42;";
        await h.onContentChange("src/index.ts", content);
 
        const written = serviceWriteFileSpy
          ? serviceWriteFileSpy.mock.calls[0][1]
          : wc.fs.writeFile.mock.calls[0][1];
        expect(written).toBe(content);
      });
 
      it("handles a root-level file without path-separator issues", async () => {
        await h.onContentChange("package.json", '{"name":"test"}');
 
        const calledPath = serviceWriteFileSpy
          ? serviceWriteFileSpy.mock.calls[0][0]
          : wc.fs.writeFile.mock.calls[0][0];
 
        // Must not double-slash or lose the filename
        expect(calledPath).not.toContain("//");
        expect(calledPath).toContain("package.json");
      });
    });
 
    
    // OUTBOUND — file create
    
 
    describe("OUTBOUND: file create", () => {
      it("writes the new file to WC", async () => {
        await h.onFileCreate(
          "src/components/Modal.tsx",
          "src/components",
          "// modal"
        );
        expect(wc.fs.writeFile).toHaveBeenCalled();
        const writtenPath: string = wc.fs.writeFile.mock.calls[0][0];
        expect(writtenPath).toContain("src/components/Modal.tsx");
      });
 
      it("creates parent directory before writing (mkdir before writeFile)", async () => {
        await h.onFileCreate(
          "src/utils/helpers.ts",
          "src/utils",
          "// helpers"
        );
 
        // If mkdir was called, it must precede writeFile
        if (wc.fs.mkdir.mock.calls.length > 0) {
          const mkdirOrder =
            wc.fs.mkdir.mock.invocationCallOrder[0];
          const writeOrder =
            wc.fs.writeFile.mock.invocationCallOrder[0];
          expect(mkdirOrder).toBeLessThan(writeOrder);
        } else {
          // Some adapters skip mkdir for root files — writeFile must still be called
          expect(wc.fs.writeFile).toHaveBeenCalled();
        }
      });
 
      it("writes exactly the content provided", async () => {
        await h.onFileCreate("src/New.tsx", "src", "// new content");
        const written = wc.fs.writeFile.mock.calls[0][1];
        expect(written).toBe("// new content");
      });
 
      it("does NOT call rm when creating a file", async () => {
        await h.onFileCreate("src/New.tsx", "src", "");
        expect(wc.fs.rm).not.toHaveBeenCalled();
      });
    });
 
    
    // OUTBOUND — folder create
    
 
    describe("OUTBOUND: folder create", () => {
      it("calls mkdir with recursive:true", async () => {
        await h.onFolderCreate("src/utils", "src");
 
        expect(wc.fs.mkdir).toHaveBeenCalled();
        const mkdirArgs = wc.fs.mkdir.mock.calls[0];
        expect(mkdirArgs[0]).toContain("src/utils");
        expect(mkdirArgs[1]).toMatchObject({ recursive: true });
      });
 
      it("does NOT call rm when creating a folder", async () => {
        await h.onFolderCreate("src/utils", "src");
        expect(wc.fs.rm).not.toHaveBeenCalled();
      });
    });
 
    
    // OUTBOUND — file delete
    
 
    describe("OUTBOUND: file delete", () => {
      it("calls fs.rm for the correct path", async () => {
        await h.onFileDelete("src/components/OldButton.tsx");
 
        expect(wc.fs.rm).toHaveBeenCalled();
        const rmPath: string = wc.fs.rm.mock.calls[0][0];
        expect(rmPath).toContain("src/components/OldButton.tsx");
      });
 
      it("does NOT call writeFile when deleting", async () => {
        await h.onFileDelete("src/components/OldButton.tsx");
        expect(wc.fs.writeFile).not.toHaveBeenCalled();
      });
    });
 
    
    // OUTBOUND — folder delete
    
 
    describe("OUTBOUND: folder delete", () => {
      it("calls fs.rm with the correct path", async () => {
        await h.onFolderDelete("src/components");
 
        expect(wc.fs.rm).toHaveBeenCalled();
        const rmPath: string = wc.fs.rm.mock.calls[0][0];
        expect(rmPath).toContain("src/components");
      });
 
      it("calls fs.rm with recursive:true", async () => {
        await h.onFolderDelete("src/components");
 
        const rmOpts = wc.fs.rm.mock.calls[0][1];
        expect(rmOpts).toMatchObject({ recursive: true });
      });
 
      it("does NOT call writeFile when deleting a folder", async () => {
        await h.onFolderDelete("src/components");
        expect(wc.fs.writeFile).not.toHaveBeenCalled();
      });
    });
 
    
    // OUTBOUND — file rename
    
 
    describe("OUTBOUND: file rename", () => {
      it("writes content to the new path", async () => {
        await h.onFileRename(
          "src/components/Button.tsx",
          "src/components/PrimaryButton.tsx",
          "// button"
        );
 
        expect(wc.fs.writeFile).toHaveBeenCalled();
        const writtenPath: string = wc.fs.writeFile.mock.calls.find(
          (c: string[]) => c[0].includes("PrimaryButton")
        )![0];
        expect(writtenPath).toContain("PrimaryButton.tsx");
      });
 
      it("removes the old path", async () => {
        await h.onFileRename(
          "src/components/Button.tsx",
          "src/components/PrimaryButton.tsx",
          "// button"
        );
 
        expect(wc.fs.rm).toHaveBeenCalled();
        const rmPath: string = wc.fs.rm.mock.calls[0][0];
        expect(rmPath).toContain("Button.tsx");
        // Must NOT rm the new path
        expect(rmPath).not.toContain("PrimaryButton");
      });
 
      it("writes new path BEFORE removing old path (no data-loss window)", async () => {
        await h.onFileRename("src/A.tsx", "src/B.tsx", "// content");
 
        const writeOrder = wc.fs.writeFile.mock.invocationCallOrder.find(
          (_: number, i: number) =>
            (wc.fs.writeFile.mock.calls[i][0] as string).includes("B.tsx")
        ) ?? wc.fs.writeFile.mock.invocationCallOrder[0];
 
        const rmOrder = wc.fs.rm.mock.invocationCallOrder[0];
        expect(writeOrder).toBeLessThan(rmOrder);
      });
 
      it("writes to new path exactly once", async () => {
        await h.onFileRename("src/A.tsx", "src/B.tsx", "// content");
 
        const writesToB = wc.fs.writeFile.mock.calls.filter(
          (c: string[]) => c[0].includes("B.tsx")
        );
        expect(writesToB).toHaveLength(1);
      });
 
      it("passes the content to the new file", async () => {
        await h.onFileRename("src/A.tsx", "src/B.tsx", "// my content");
 
        const writeToB = wc.fs.writeFile.mock.calls.find(
          (c: string[]) => c[0].includes("B.tsx")
        );
        expect(writeToB![1]).toBe("// my content");
      });
    });
  });

  describe("INBOUND: FileCreationWatcher — polling detects filesystem changes", () => {
     let watcher: FileCreationWatcher;
  let mockWc: MockWcInstance;
 
  /**
   * Build a mock readdir that drives the watcher's internal scan.
   * Each key is a path as the watcher sees it (no leading slash after
   * the watcher normalises).  Values are entry descriptors.
   */
  function buildReaddir(
    structure: Record<string, Array<{ name: string; isFile: boolean }>>
  ): Mock {
    return vi.fn().mockImplementation(async (rawPath: string) => {
      // Watcher calls readdir with a leading slash, e.g. "/" or "/src"
      const normalized = rawPath.replace(/^\//, "") || "";
      const entries = structure[normalized] ?? [];
      return entries.map(({ name, isFile }) => ({
        name,
        isFile: () => isFile,
        isDirectory: () => !isFile,
      }));
    });
  }
 
  beforeEach(() => {
    vi.useFakeTimers();
    watcher = new FileCreationWatcher();
    mockWc = makeMockWc();
  });
 
  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  it("fires onFileCreated when a new file appears", async () => {
    //build a empty state before
    mockWc.fs.readdir = buildReaddir({ "": [] });
    //mock or create a fake function to read file content, the watcher calls it to get the content of the new file,note this is not called in test itself but watcher needs it or it will throw error
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// new");
    //create a fake function which resembels the onfileCreated callback passed by parent component
    const onFileCreated = vi.fn();
    //initialize the watcher with the mock wc and the onFileCreated callback
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
    //now fake the addition of a new file by changing the readdir response to include the new file, the watcher should pick this up on the next poll
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "index.ts", isFile: true }],
    });

    //forward time
    await vi.advanceTimersByTimeAsync(2500);
    //expect that the onfileCreated is being called (means file is created in the file tree)
    expect(onFileCreated).toHaveBeenCalledWith("index.ts", "");
  });

  it("fires onFolderCreated when a new directory appears", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("");
 
    const onFolderCreated = vi.fn();
    await watcher.initialize(mockWc as any, vi.fn(), onFolderCreated, []);
 
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "utils", isFile: false }],
      utils: [],
    });
 
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFolderCreated).toHaveBeenCalledWith("utils", "");
  });

   it("fires onFileDeleted when a tracked file disappears", async () => {
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "old.ts", isFile: true }],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// old");
 
    const onFileDeleted = vi.fn();
    await watcher.initialize(mockWc as any, vi.fn(), vi.fn(), [], {
      onFileDeleted,
    });
 
    mockWc.fs.readdir = buildReaddir({ "": [] });
    await vi.advanceTimersByTimeAsync(2500);
 
    expect(onFileDeleted).toHaveBeenCalledWith("old.ts", "");
  });
   it("fires onFileRenamed when content moves to a new path (content-hash match)", async () => {
    // Initial state: Button.tsx exists with known content
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "Button.tsx", isFile: true }],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// button");
 
    const onFileRenamed = vi.fn();
    await watcher.initialize(mockWc as any, vi.fn(), vi.fn(), [], {
      onFileRenamed,
    });
 
    // Button.tsx gone, PrimaryButton.tsx appears with identical content
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "PrimaryButton.tsx", isFile: true }],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// button");
 
    await vi.advanceTimersByTimeAsync(2500);
 
    expect(onFileRenamed).toHaveBeenCalledWith(
      "Button.tsx",
      "PrimaryButton.tsx",
      expect.any(String) // parentPath
    );
  });
  it("does not fire any callback for excluded paths (node_modules)", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(
      mockWc as any,
      onFileCreated,
      vi.fn(),
      ["node_modules"]
    );
 
    // node_modules and its contents appear
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "node_modules", isFile: false }],
      node_modules: [{ name: "react", isFile: false }],
      "node_modules/react": [{ name: "index.js", isFile: true }],
    });
 
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFileCreated).not.toHaveBeenCalled();
  });
  it("does not fire onFileCreated for files present at initialization", async () => {
    // File already there when watcher starts
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "existing.ts", isFile: true }],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// exists");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
 
    // No change — just the poll firing
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFileCreated).not.toHaveBeenCalled();
  });
   it("reports the correct parentPath for a nested new file", async () => {
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "src", isFile: false }],
      src: [],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
 
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "src", isFile: false }],
      src: [{ name: "Button.tsx", isFile: true }],
    });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// btn");
 
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFileCreated).toHaveBeenCalledWith("src/Button.tsx", "src");
  });
  it("stops polling after watcher.stop() — no callbacks after stop", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
 
    watcher.stop();
 
    // New file appears after stop
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "afterStop.ts", isFile: true }],
    });
 
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFileCreated).not.toHaveBeenCalled();
  });
   it("fires onFileCreated exactly once per new file across multiple polls", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// content");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
 
    // File appears
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "once.ts", isFile: true }],
    });
 
    // Two full poll cycles
    await vi.advanceTimersByTimeAsync(5000);
 
    const callsForFile = onFileCreated.mock.calls.filter(
      (c: string[]) => c[0] === "once.ts"
    );
    expect(callsForFile).toHaveLength(1);
  });
  it("fires onFolderCreated exactly once per new folder across multiple polls", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("");
 
    const onFolderCreated = vi.fn();
    await watcher.initialize(mockWc as any, vi.fn(), onFolderCreated, []);
 
    mockWc.fs.readdir = buildReaddir({
      "": [{ name: "lib", isFile: false }],
      lib: [],
    });
 
    await vi.advanceTimersByTimeAsync(5000);
 
    const callsForFolder = onFolderCreated.mock.calls.filter(
      (c: string[]) => c[0] === "lib"
    );
    expect(callsForFolder).toHaveLength(1);
  });
   it("handles multiple simultaneous new files correctly", async () => {
    mockWc.fs.readdir = buildReaddir({ "": [] });
    mockWc.fs.readFile = vi.fn().mockResolvedValue("// content");
 
    const onFileCreated = vi.fn();
    await watcher.initialize(mockWc as any, onFileCreated, vi.fn(), []);
 
    mockWc.fs.readdir = buildReaddir({
      "": [
        { name: "A.ts", isFile: true },
        { name: "B.ts", isFile: true },
        { name: "C.ts", isFile: true },
      ],
    });
 
    await vi.advanceTimersByTimeAsync(2500);
    expect(onFileCreated).toHaveBeenCalledTimes(3);
  });


  });



}


const normalPlaygroundAdapter: WcSyncAdapter = {
  playgroundName: "Normal Playground",
 
  async setup() {
    const wc = makeMockWc();
 
    // Simulate webContainerService.writeFile — the real boundary for content changes.
    // The real implementation does:
    //   instance.fs.mkdir(`/${folderPath}`, { recursive: true })
    //   instance.fs.writeFile(`/${path}`, content)
    // We spy on the service method itself so assertions check (bare path, content).
    const serviceWriteFileSpy = vi.fn().mockImplementation(
      async (path: string, content: string) => {
        // Replicate what the service does internally so wc.fs calls are also recorded
        const parts = path.split("/").filter(Boolean);
        if (parts.length > 1) {
          const dir = parts.slice(0, -1).join("/");
          await wc.fs.mkdir(`/${dir}`, { recursive: true });
        }
        await wc.fs.writeFile(`/${path}`, content);
      }
    );
 
    const handlers = {
      // ── content change ───────────────────────────────────────────
      // MainPlaygroundPage.handleContentChange:
      //   writeFileSync(filePath, value)
      // useWebContainer.writeFileSync:
      //   await webContainerService.writeFile(path, content)
      async onContentChange(filePath: string, newContent: string) {
        await serviceWriteFileSpy(filePath, newContent);
      },
 
      // ── file create ──────────────────────────────────────────────
      // useFileExplorer.handleAddFile (lines verbatim from store):
      //   const pathParts = filePath.split('/')
      //   if (pathParts.length > 1) {
      //     const dirPath = pathParts.slice(0, -1).join('/')
      //     await instance.fs.mkdir(dirPath, { recursive: true })
      //   }
      //   await instance.fs.writeFile(filePath, fileContent, 'utf-8')
      async onFileCreate(filePath: string, _parentPath: string, content = "") {
        const pathParts = filePath.split("/");
        if (pathParts.length > 1) {
          const dirPath = pathParts.slice(0, -1).join("/");
          await wc.fs.mkdir(dirPath, { recursive: true });
        }
        await wc.fs.writeFile(filePath, content, "utf-8");
      },
 
      // ── folder create ────────────────────────────────────────────
      // useFileExplorer.handleAddFolder:
      //   await instance.fs.mkdir(folderPath, { recursive: true })
      async onFolderCreate(folderPath: string, _parentPath: string) {
        await wc.fs.mkdir(folderPath, { recursive: true });
      },
 
      // ── file delete ──────────────────────────────────────────────
      // useFileExplorer.handleDeleteFile:
      //   await instance.fs.rm(filePath)   ← NO options
      async onFileDelete(filePath: string) {
        await wc.fs.rm(filePath);
      },
 
      // ── folder delete ────────────────────────────────────────────
      // useFileExplorer.handleDeleteFolder:
      //   await instance.fs.rm(folderPath, { recursive: true, force: true })
      async onFolderDelete(folderPath: string) {
        await wc.fs.rm(folderPath, { recursive: true, force: true });
      },
 
      // ── file rename ──────────────────────────────────────────────
      // useFileExplorer.handleRenameFile:
      //   const content = await instance.fs.readFile(oldPath, 'utf-8')
      //   await instance.fs.writeFile(newPath, content, 'utf-8')
      //   await instance.fs.rm(oldPath, { force: true })
      async onFileRename(oldPath: string, newPath: string, content = "") {
        wc.fs.readFile.mockResolvedValueOnce(content);
        const fileContent = await wc.fs.readFile(oldPath, "utf-8");
        await wc.fs.writeFile(newPath, fileContent, "utf-8");
        await wc.fs.rm(oldPath, { force: true });
      },
    };
 
    return { wc, serviceWriteFileSpy, handlers };
  },
};
// ─── 2. Normal Collab Playground ──────────────────────────────────────────────
//
// onContentChange (HOST path):
//   CollabPlayground.handleFileContentChange → webContainer.syncFileToContainer(path, content)
//   useCollabWebContainer.syncFileToContainer (isHost branch):
//     await hostWebContainer.writeFileSync(path, content)
//     → webContainerService.writeFile(path, content)   ← same as normal playground
//
// file ops: IDENTICAL to normal playground (same useFileExplorer store actions,
//           same instance.fs call signatures)
 
const normalCollabAdapter: WcSyncAdapter = {
  playgroundName: "Normal Collab Playground (host)",
 
  async setup() {
    const wc = makeMockWc();
 
    // syncFileToContainer (host branch):
    //   await hostWebContainer.writeFileSync(path, content)
    //   → webContainerService.writeFile(path, content)
    const serviceWriteFileSpy = vi.fn().mockImplementation(
      async (path: string, content: string) => {
        const parts = path.split("/").filter(Boolean);
        if (parts.length > 1) {
          const dir = parts.slice(0, -1).join("/");
          await wc.fs.mkdir(`/${dir}`, { recursive: true });
        }
        await wc.fs.writeFile(`/${path}`, content);
      }
    );
 
    const handlers = {
      // useCollabWebContainer.syncFileToContainer (host):
      //   await hostWebContainer.writeFileSync(path, content)
      //   → webContainerService.writeFile(path, content)
      async onContentChange(filePath: string, newContent: string) {
        await serviceWriteFileSpy(filePath, newContent);
      },
 
      // Identical to normal playground (same store)
      async onFileCreate(filePath: string, _parentPath: string, content = "") {
        const pathParts = filePath.split("/");
        if (pathParts.length > 1) {
          const dirPath = pathParts.slice(0, -1).join("/");
          await wc.fs.mkdir(dirPath, { recursive: true });
        }
        await wc.fs.writeFile(filePath, content, "utf-8");
      },
 
      async onFolderCreate(folderPath: string, _parentPath: string) {
        await wc.fs.mkdir(folderPath, { recursive: true });
      },
 
      async onFileDelete(filePath: string) {
        await wc.fs.rm(filePath);
      },
 
      async onFolderDelete(folderPath: string) {
        await wc.fs.rm(folderPath, { recursive: true, force: true });
      },
 
      async onFileRename(oldPath: string, newPath: string, content = "") {
        wc.fs.readFile.mockResolvedValueOnce(content);
        const fileContent = await wc.fs.readFile(oldPath, "utf-8");
        await wc.fs.writeFile(newPath, fileContent, "utf-8");
        await wc.fs.rm(oldPath, { force: true });
      },
    };
 
    return { wc, serviceWriteFileSpy, handlers };
  },
};

// ─── 3. GitHub Playground ─────────────────────────────────────────────────────
//
// All handlers call instance.fs directly WITH a leading slash.
//
// onContentChange (handleContentChange):
//   await webContainerInstance.fs.writeFile(`/${filePath}`, newContent, 'utf-8')
//
// handleCreateFile:
//   await webContainerInstance.fs.writeFile(`/${fullPath}`, '', 'utf-8')
//
// handleCreateFolder:
//   await webContainerInstance.fs.mkdir(`/${fullPath}`, { recursive: true })
//   await webContainerInstance.fs.writeFile(`/${fullPath}/.gitkeep`, '', 'utf-8')
//
// handleDeleteFile:
//   await webContainerInstance.fs.rm(`/${fileToDelete.path}`)  ← NO options
//
// handleDeleteFolder:
//   await webContainerInstance.fs.rm(`/${folderToDelete.path}`, { recursive: true })
//   NOTE: no `force` in GitHub playground's folder delete
//
// handleRenameFile:
//   if (dir) await webContainerInstance.fs.mkdir(`/${dir}`, { recursive: true })
//   await webContainerInstance.fs.writeFile(`/${newPath}`, currentContent, 'utf-8')
//   await webContainerInstance.fs.rm(`/${file.path}`)  ← NO options
 
const githubPlaygroundAdapter: WcSyncAdapter = {
  playgroundName: "GitHub Playground",
 
  async setup() {
    const wc = makeMockWc();
 
    const handlers = {
      async onContentChange(filePath: string, newContent: string) {
        await wc.fs.writeFile(`/${filePath}`, newContent, "utf-8");
      },
 
      async onFileCreate(filePath: string, _parentPath: string, content = "") {
        await wc.fs.writeFile(`/${filePath}`, content, "utf-8");
      },
 
      async onFolderCreate(folderPath: string, _parentPath: string) {
        await wc.fs.mkdir(`/${folderPath}`, { recursive: true });
        await wc.fs.writeFile(`/${folderPath}/.gitkeep`, "", "utf-8");
      },
 
      async onFileDelete(filePath: string) {
        try {
          await wc.fs.rm(`/${filePath}`);
        } catch {
          // real code swallows this
        }
      },
 
      async onFolderDelete(folderPath: string) {
        await wc.fs.rm(`/${folderPath}`, { recursive: true });
      },
 
      async onFileRename(oldPath: string, newPath: string, content = "") {
        const dir = newPath.split("/").slice(0, -1).join("/");
        if (dir) {
          await wc.fs.mkdir(`/${dir}`, { recursive: true });
        }
        await wc.fs.writeFile(`/${newPath}`, content, "utf-8");
        await wc.fs.rm(`/${oldPath}`);
      },
    };
 
    return { wc, serviceWriteFileSpy: null, handlers };
  },
};


// ─── 4. GitHub Collab Playground ──────────────────────────────────────────────
//
// WC calls are identical to GitHub Playground.
// Broadcast helpers are stubbed — they are socket concerns, not tested here.
 
const githubCollabAdapter: WcSyncAdapter = {
  playgroundName: "GitHub Collab Playground",
 
  async setup() {
    const wc = makeMockWc();
 
    // Broadcast stubs (socket concern, not tested here)
    const broadcastContentChange = vi.fn();
    const broadcastFileCreate = vi.fn();
    const broadcastFileDelete = vi.fn();
    const broadcastFileRename = vi.fn();
 
    const handlers = {
      // handleContentChange in GitHubCollabPlayground:
      //   await wc.fs.writeFile(`/${filePath}`, newContent, 'utf-8')
      //   broadcastContentChange(filePath, '', newContent)
      async onContentChange(filePath: string, newContent: string) {
        await wc.fs.writeFile(`/${filePath}`, newContent, "utf-8");
        broadcastContentChange(filePath, "", newContent);
      },
 
      async onFileCreate(filePath: string, _parentPath: string, content = "") {
        await wc.fs.writeFile(`/${filePath}`, content, "utf-8");
        broadcastFileCreate(filePath, content);
      },
 
      async onFolderCreate(folderPath: string, _parentPath: string) {
        const gitkeepPath = `${folderPath}/.gitkeep`;
        await wc.fs.mkdir(`/${folderPath}`, { recursive: true });
        await wc.fs.writeFile(`/${gitkeepPath}`, "", "utf-8");
        broadcastFileCreate(gitkeepPath, "");
      },
 
      async onFileDelete(filePath: string) {
        try {
          await wc.fs.rm(`/${filePath}`);
        } catch {}
        broadcastFileDelete(filePath);
      },
 
      async onFolderDelete(folderPath: string) {
        await wc.fs.rm(`/${folderPath}`, { recursive: true });
        broadcastFileDelete(folderPath);
      },
 
      async onFileRename(oldPath: string, newPath: string, content = "") {
        const dir = newPath.split("/").slice(0, -1).join("/");
        if (dir) {
          await wc.fs.mkdir(`/${dir}`, { recursive: true });
        }
        await wc.fs.writeFile(`/${newPath}`, content, "utf-8");
        await wc.fs.rm(`/${oldPath}`);
        broadcastFileRename(oldPath, newPath, content);
      },
    };
 
    return { wc, serviceWriteFileSpy: null, handlers };
  },
};
 
// ─── Register 
 
createWcSyncSuite(normalPlaygroundAdapter);
createWcSyncSuite(normalCollabAdapter);
createWcSyncSuite(githubPlaygroundAdapter);
createWcSyncSuite(githubCollabAdapter);


