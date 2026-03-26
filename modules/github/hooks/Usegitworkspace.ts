import { create } from 'zustand';
import { toast } from 'sonner';
import { WebContainer } from '@webcontainer/api';

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
}
interface OpenFile {
  path: string;
  content: string;
  originalContent: string; // Content from GitHub (for diff)
  sha: string;
  hasChanges: boolean;
}

interface FileChange {
  path: string;
  type: 'modified' | 'created' | 'deleted';
  content?: string;
  oldSha?: string;
}
interface BranchWorkspace {
  files: GitHubFile[];
  remoteState: Map<string, string>;
  openFiles: OpenFile[];
  activeFilePath: string | null;
  modifiedFiles: Set<string>;
  createdFiles: Set<string>;
  deletedFiles: Set<string>;
  stagedFiles: Set<string>;
}

function emptyBranchWorkspace(): BranchWorkspace {
  return {
    files: [],
    remoteState: new Map(),
    openFiles: [],
    activeFilePath: null,
    modifiedFiles: new Set(),
    createdFiles: new Set(),
    deletedFiles: new Set(),
    stagedFiles: new Set(),
  };
}
interface GitWorkspaceState {
  // ===== Repository State =====
  repoFullName: string;
  owner: string;
  repo: string;
  currentBranch: string;
  isSwitchingBranch: boolean; 
  branchWorkspaces: Map<string, BranchWorkspace>; // branch name -> workspace state
  
  // ===== File System State =====
  files: GitHubFile[]; // All files from GitHub
  remoteState: Map<string, string>; // path -> original content from GitHub
  
  // ===== Open Files (Tabs) =====
  openFiles: OpenFile[];
  activeFilePath: string | null;
  
  // ===== Change Tracking =====
  modifiedFiles: Set<string>; // Files edited (tracked by content diff)
  createdFiles: Set<string>;  // New files (not in remoteState)
  deletedFiles: Set<string>;  // Deleted files

  stagedFiles: Set<string>; // For future staging/committing features

  beginBranchSwitch: (newBranch: string) => void;
  unmarkFileCreated: (path: string) => void;
  


  
  // ===== Actions =====
  
  // Initialize workspace
  initializeWorkspace: (
    repoFullName: string,
    branch: string,
    files: GitHubFile[]
  ) => void;
  
  // File operations
  openFile: (file: GitHubFile) => void;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  updateFileContent: (path: string, newContent: string) => void;
  
  // Change tracking
  markFileModified: (path: string,restoredContent?:string) => void;
  markFileCreated: (path: string,restoredContent?:string) => void;
  markFileDeleted: (path: string) => void;
  unmarkFileModified: (path: string) => void; // For discard changes
  
  // Git operations (we'll implement these)
  getAllChanges: () => FileChange[];
  hasUnsavedChanges: () => boolean;
  discardFileChanges: (path: string) => void;
  discardAllChanges: () => void;
  hasStagedChanges: () => boolean; // ✅ New



  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
  stageAllFiles: () => void;
  unstageAllFiles: () => void;
  isFileStaged: (path: string) => boolean;

  
  // WebContainer sync
  syncFileToWebContainer: (
    path: string,
    content: string,
    instance: WebContainer
  ) => Promise<void>;
  
  // File tree updates (after create/delete/rename)
  addFileToTree: (file: GitHubFile) => void;
  removeFileFromTree: (path: string) => void;
  updateFileInTree: (path: string, updates: Partial<GitHubFile>) => void;
  
  // Reset
  reset: () => void;
}

/** Sync the flat convenience fields from a BranchWorkspace into state. */
function flattenWorkspace(ws: BranchWorkspace): Pick<
  GitWorkspaceState,
  'files' | 'remoteState' | 'openFiles' | 'activeFilePath' |
  'modifiedFiles' | 'createdFiles' | 'deletedFiles' | 'stagedFiles'
> {
  return {
    files: ws.files,
    remoteState: ws.remoteState,
    openFiles: ws.openFiles,
    activeFilePath: ws.activeFilePath,
    modifiedFiles: ws.modifiedFiles,
    createdFiles: ws.createdFiles,
    deletedFiles: ws.deletedFiles,
    stagedFiles: ws.stagedFiles,
  };
}
function updateActiveBranch(
  state: GitWorkspaceState,
  updater: (ws: BranchWorkspace) => BranchWorkspace
): Partial<GitWorkspaceState> {
  const branch = state.currentBranch;
  const current = state.branchWorkspaces.get(branch) ?? emptyBranchWorkspace();
  const updated = updater(current);
  const newMap = new Map(state.branchWorkspaces);
  newMap.set(branch, updated);
  return { branchWorkspaces: newMap, ...flattenWorkspace(updated) };
}

const INITIAL_FLAT = flattenWorkspace(emptyBranchWorkspace());

const initialState = {
  repoFullName: '',
  owner: '',
  repo: '',
  currentBranch: 'main',
  isSwitchingBranch: false,
  branchWorkspaces: new Map<string,BranchWorkspace>(),
  ...INITIAL_FLAT,
};


export const useGitWorkspace = create<GitWorkspaceState>((set, get) => ({
  ...initialState,

  beginBranchSwitch: (newBranch) => {
    set((state) => {
      // Ensure target branch has at least an empty workspace so nothing
      // tries to read undefined during the loading window.
      const newMap = new Map(state.branchWorkspaces);
      if (!newMap.has(newBranch)) {
        newMap.set(newBranch, emptyBranchWorkspace());
      }
      const ws = newMap.get(newBranch)!;
      return {
        isSwitchingBranch: true,
        currentBranch: newBranch,
        branchWorkspaces: newMap,
        ...flattenWorkspace(ws),
      };
    });
    console.log(`🔀 [GitWorkspace] Branch switch started → ${newBranch}`);
  },

  
  // ===== Initialize Workspace =====
  initializeWorkspace: (repoFullName, branch, files) => {
    const [owner, repo] = repoFullName.split('/');
    
    // Build remote state map (original content from GitHub)
    const remoteState = new Map<string, string>();
    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        remoteState.set(file.path, file.content);
      }
    });

    const ws: BranchWorkspace = {
      files,
      remoteState,
      openFiles: [],
      activeFilePath: null,
      modifiedFiles: new Set(),
      createdFiles: new Set(),
      deletedFiles: new Set(),
      stagedFiles: new Set(),
    };

    
    console.log(`📦 [GitWorkspace] Initialized: ${repoFullName} (${branch})`);
    console.log(`📄 [GitWorkspace] Loaded ${remoteState.size} files into remote state`);
    
    set((state)=>{
      const newMap = new Map(state.branchWorkspaces);
      newMap.set(branch,ws);
      return {
        repoFullName,
        owner,
        repo,
        currentBranch:branch,
        isSwitchingBranch: false,
        branchWorkspaces: newMap,
        ...flattenWorkspace(ws),
      }

    })
    console.log(`📦 [GitWorkspace] Initialized branch "${branch}" – ${remoteState.size} files`);
  },
  
  // ===== Open File =====
  openFile: (file) => {
     if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const existing = ws.openFiles.find((f) => f.path === file.path);
      if (existing) {
        return { ...ws, activeFilePath: file.path };
      }
      const originalContent = ws.remoteState.get(file.path) ?? file.content ?? '';
      const newOpenFile: OpenFile = {
        path: file.path,
        content: originalContent,
        originalContent,
        sha: file.sha,
        hasChanges: false,
      };
      return {
        ...ws,
        openFiles: [...ws.openFiles, newOpenFile],
        activeFilePath: file.path,
      };
    }));
  },
  
  // ===== Close File =====
  closeFile: (path) => {
    set((state) => updateActiveBranch(state,(ws)=>{
      const newOpenFiles = ws.openFiles.filter((f)=>f.path !== path);
      let newActive = ws.activeFilePath;
      if(ws.activeFilePath === path){
        newActive = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null;
      }
      return {
        ...ws,
        openFiles: newOpenFiles,
        activeFilePath: newActive,
      }
    }))
  },
  
  // ===== Close All Files =====
  closeAllFiles: () => {
    set((state)=>updateActiveBranch(state,(ws)=>(
      {
        ...ws,
        openFiles: [],
        activeFilePath: null,
      }
    )))
  },
  
  // ===== Update File Content (from Monaco editor) =====
  updateFileContent: (path, newContent) => {
    if (get().isSwitchingBranch) return;
    set((state) => {
      const branch = state.currentBranch;
      const ws = state.branchWorkspaces.get(branch) ?? emptyBranchWorkspace();
      const originalContent = ws.remoteState.get(path) ?? '';
      const hasChanges = newContent !== originalContent;

      const updatedOpenFiles = ws.openFiles.map((f) =>
        f.path === path ? { ...f, content: newContent, hasChanges } : f
      );

      const newModified = new Set(ws.modifiedFiles);
      if (hasChanges) {
        newModified.add(path);
      } else {
        newModified.delete(path);
      }

      const updated: BranchWorkspace = {
        ...ws,
        openFiles: updatedOpenFiles,
        modifiedFiles: newModified,
      };
      const newMap = new Map(state.branchWorkspaces);
      newMap.set(branch, updated);
      return { branchWorkspaces: newMap, ...flattenWorkspace(updated) };
    });
  },
  
  // ===== Mark File Modified =====
  markFileModified: (path,restoredContent) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const newModified = new Set([...ws.modifiedFiles, path]);
      if (restoredContent === undefined) {
        return { ...ws, modifiedFiles: newModified };
      }
      const existingOpen = ws.openFiles.find((f) => f.path === path);
      if (existingOpen) {
        return {
          ...ws,
          modifiedFiles: newModified,
          openFiles: ws.openFiles.map((f) =>
            f.path === path ? { ...f, content: restoredContent, hasChanges: true } : f
          ),
        };
      }
      // File not open – add it so draft content is available on open
      const originalContent = ws.remoteState.get(path) ?? '';
      return {
        ...ws,
        modifiedFiles: newModified,
        openFiles: [
          ...ws.openFiles,
          {
            path,
            content: restoredContent,
            originalContent,
            sha: ws.files.find((f) => f.path === path)?.sha ?? '',
            hasChanges: true,
          },
        ],
      };
    }));
  },
  
  // ===== Mark File Created =====
  markFileCreated: (path,restoredContent) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const newCreated = new Set([...ws.createdFiles, path]);
      if (restoredContent === undefined) {
        return { ...ws, createdFiles: newCreated };
      }
      const existingOpen = ws.openFiles.find((f) => f.path === path);
      if (!existingOpen) {
        return {
          ...ws,
          createdFiles: newCreated,
          openFiles: [
            ...ws.openFiles,
            { path, content: restoredContent, originalContent: '', sha: '', hasChanges: true },
          ],
        };
      }
      return {
        ...ws,
        createdFiles: newCreated,
        openFiles: ws.openFiles.map((f) =>
          f.path === path ? { ...f, content: restoredContent, hasChanges: true } : f
        ),
      };
    }));
  },
  
  // ===== Mark File Deleted =====
  markFileDeleted: (path) => {
   if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      if (ws.createdFiles.has(path)) {
        // Local-only file – just untrack
        const newCreated = new Set(ws.createdFiles);
        newCreated.delete(path);
        const newModified = new Set(ws.modifiedFiles);
        newModified.delete(path);
        return { ...ws, createdFiles: newCreated, modifiedFiles: newModified };
      }
      return {
        ...ws,
        deletedFiles: new Set([...ws.deletedFiles, path]),
        modifiedFiles: new Set([...ws.modifiedFiles].filter((p) => p !== path)),
      };
    }));
  },
  
  // ===== Unmark File Modified =====
  unmarkFileModified: (path) => {
     if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const newModified = new Set(ws.modifiedFiles);
      newModified.delete(path);
      return { ...ws, modifiedFiles: newModified };
    }));
  },

  unmarkFileCreated: (path) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const newCreated = new Set(ws.createdFiles);
      newCreated.delete(path);
      return { ...ws, createdFiles: newCreated };
    }));
  },


 stageFile: (path) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      stagedFiles: new Set([...ws.stagedFiles, path]),
    })));
    toast.success(`Staged ${path.split('/').pop()}`);
  },

  
  unstageFile: (path) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {
      const s = new Set(ws.stagedFiles);
      s.delete(path);
      return { ...ws, stagedFiles: s };
    }));
    toast.success(`Unstaged ${path.split('/').pop()}`);
  },
  
  stageAllFiles: () => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      stagedFiles: new Set([
        ...ws.modifiedFiles,
        ...ws.createdFiles,
        ...ws.deletedFiles,
      ]),
    })));
  },
  
  unstageAllFiles: () => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      stagedFiles: new Set(),
    })));
  },
  
  
  isFileStaged: (path) => {
    return get().stagedFiles.has(path);
  },
  
  // ===== Get All Changes =====
 getAllChanges: () => {
  const { modifiedFiles, createdFiles, deletedFiles, openFiles, remoteState, stagedFiles } = get();
  
  const changes: FileChange[] = [];

  if (stagedFiles.size > 0) {
    // Only commit staged files, respecting their actual type
    stagedFiles.forEach(path => {
      if (deletedFiles.has(path)) {
        changes.push({ path, type: 'deleted', oldSha: undefined })
      } else if (createdFiles.has(path)) {
        const openFile = openFiles.find(f => f.path === path)
        changes.push({ path, type: 'created', content: openFile?.content || '' })
      } else if (modifiedFiles.has(path)) {
        const openFile = openFiles.find(f => f.path === path)
        changes.push({ path, type: 'modified', content: openFile?.content, oldSha: openFile?.sha })
      }
    })
  } else {
    // Commit all changes
    modifiedFiles.forEach(path => {
      const openFile = openFiles.find(f => f.path === path)
      changes.push({ path, type: 'modified', content: openFile?.content, oldSha: openFile?.sha })
    })

    createdFiles.forEach(path => {
      const openFile = openFiles.find(f => f.path === path)
      changes.push({ path, type: 'created', content: openFile?.content || '' })
    })

    deletedFiles.forEach(path => {
      changes.push({ path, type: 'deleted' })
    })
  }

  return changes;
},
  
  // ===== Has Unsaved Changes =====
  hasUnsavedChanges: () => {
    const { modifiedFiles, createdFiles, deletedFiles } = get();
    return modifiedFiles.size > 0 || createdFiles.size > 0 || deletedFiles.size > 0;
  },
  hasStagedChanges: () => {
    return get().stagedFiles.size > 0;
  },
  // ===== Discard File Changes =====
  discardFileChanges: (path) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => {

      if (ws.deletedFiles.has(path)) {
      const originalContent = ws.remoteState.get(path) ?? '';
      const originalFile = state.files.find(f => f.path === path) ?? 
        // files was already removed from tree, reconstruct from remoteState
        { name: path.split('/').pop() ?? path, path, sha: '', size: originalContent.length, type: 'file' as const, content: originalContent };

      const newDeleted = new Set(ws.deletedFiles);
      newDeleted.delete(path);

      // Re-add to file tree
      const alreadyInTree = ws.files.some(f => f.path === path);
      const newFiles = alreadyInTree ? ws.files : [...ws.files, originalFile];

      return {
        ...ws,
        deletedFiles: newDeleted,
        files: newFiles,
      };
    }
    if (ws.createdFiles.has(path)) {
      const newCreated = new Set(ws.createdFiles);
      newCreated.delete(path);

      return {
        ...ws,
        createdFiles: newCreated,
        files: ws.files.filter(f => f.path !== path),
        openFiles: ws.openFiles.filter(f => f.path !== path),
        activeFilePath: ws.activeFilePath === path
          ? (ws.openFiles.filter(f => f.path !== path).at(-1)?.path ?? null)
          : ws.activeFilePath,
      };
    }

      const originalContent = ws.remoteState.get(path);
      if (!originalContent) {
        toast.error('Cannot restore: original content not found');
        return ws;
      }
      const newModified = new Set(ws.modifiedFiles);
      newModified.delete(path);
      return {
        ...ws,
        modifiedFiles: newModified,
        openFiles: ws.openFiles.map((f) =>
          f.path === path
            ? { ...f, content: originalContent, hasChanges: false }
            : f
        ),
      };
    }));
    toast.success(`Discarded changes to ${path.split('/').pop()}`);
  },
  
  // ===== Discard All Changes =====
  discardAllChanges: () => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      openFiles: ws.openFiles.map((f) => {
        if (ws.modifiedFiles.has(f.path)) {
          const orig = ws.remoteState.get(f.path) ?? f.originalContent;
          return { ...f, content: orig, hasChanges: false };
        }
        return f;
      }),
      modifiedFiles: new Set(),
      createdFiles: new Set(),
      deletedFiles: new Set(),
      stagedFiles: new Set(),
    })));
    toast.success('All changes discarded');
  },
  
  // ===== Sync File to WebContainer =====
  syncFileToWebContainer: async (path, content, instance) => {
    try {
      // Ensure parent directories exist
      const pathParts = path.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        await instance.fs.mkdir(dirPath, { recursive: true });
      }
      
      // Write file
      await instance.fs.writeFile(`/${path}`, content, 'utf-8');
      console.log(`💾 [GitWorkspace] Synced to WebContainer: ${path}`);
    } catch (error) {
      console.error(`❌ [GitWorkspace] Failed to sync to WebContainer: ${path}`, error);
      throw error;
    }
  },
  
  // ===== Add File to Tree =====
  addFileToTree: (file) => {
     if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      files: [...ws.files, file],
    })));
  },
  
  // ===== Remove File from Tree =====
  removeFileFromTree: (path) => {
    if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      files: ws.files.filter((f) => f.path !== path),
    })));
  },
  
  // ===== Update File in Tree =====
  updateFileInTree: (path, updates) => {
     if (get().isSwitchingBranch) return;
    set((state) => updateActiveBranch(state, (ws) => ({
      ...ws,
      files: ws.files.map((f) => (f.path === path ? { ...f, ...updates } : f)),
    })));
  },
  
  // ===== Reset =====
  reset: () => {
    set({ ...initialState, branchWorkspaces: new Map() });
  },
}));


export const useActiveFile = () => {
  const activeFilePath = useGitWorkspace(state => state.activeFilePath);
  const openFiles = useGitWorkspace(state => state.openFiles);
  return openFiles.find(f => f.path === activeFilePath);
};

/**
 * Get all modified file paths
 */
export const useModifiedFiles = () => {
  return useGitWorkspace(state => Array.from(state.modifiedFiles));
};

/**
 * Check if workspace has unsaved changes
 */
export const useHasUnsavedChanges = () => {
  return useGitWorkspace(state => state.hasUnsavedChanges());
};

/**
 * Get change count badge
 */
export const useChangeCount = () => {
  const modifiedFiles = useGitWorkspace(state => state.modifiedFiles);
  const createdFiles = useGitWorkspace(state => state.createdFiles);
  const deletedFiles = useGitWorkspace(state => state.deletedFiles);
  
  return modifiedFiles.size + createdFiles.size + deletedFiles.size;
};
export const useStagedCount = () => {
  return useGitWorkspace(state => state.stagedFiles.size);
};

export const useHasStagedChanges = () => {
  return useGitWorkspace(state => state.hasStagedChanges());
};

export const useIsSwitchingBranch = () =>
  useGitWorkspace((s) => s.isSwitchingBranch);