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

interface GitWorkspaceState {
  // ===== Repository State =====
  repoFullName: string;
  owner: string;
  repo: string;
  currentBranch: string;
  
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

const initialState = {
  repoFullName: '',
  owner: '',
  repo: '',
  currentBranch: 'main',
  files: [],
  remoteState: new Map(),
  openFiles: [],
  activeFilePath: null,
  modifiedFiles: new Set<string>(),
  createdFiles: new Set<string>(),
  deletedFiles: new Set<string>(),
  stagedFiles: new Set<string>(),
};


export const useGitWorkspace = create<GitWorkspaceState>((set, get) => ({
  ...initialState,
  
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
    
    console.log(`📦 [GitWorkspace] Initialized: ${repoFullName} (${branch})`);
    console.log(`📄 [GitWorkspace] Loaded ${remoteState.size} files into remote state`);
    
    set({
      repoFullName,
      owner,
      repo,
      currentBranch: branch,
      files,
      remoteState,
      openFiles: [],
      activeFilePath: null,
      modifiedFiles: new Set(),
      createdFiles: new Set(),
      deletedFiles: new Set(),
      stagedFiles: new Set(),
    });
  },
  
  // ===== Open File =====
  openFile: (file) => {
    const { openFiles, remoteState } = get();
    
    // Check if already open
    const existing = openFiles.find(f => f.path === file.path);
    if (existing) {
      set({ activeFilePath: file.path });
      return;
    }
    
    // Get original content from remoteState
    const originalContent = remoteState.get(file.path) || file.content || '';
    
    const newOpenFile: OpenFile = {
      path: file.path,
      content: originalContent,
      originalContent,
      sha: file.sha,
      hasChanges: false,
    };
    
    set({
      openFiles: [...openFiles, newOpenFile],
      activeFilePath: file.path,
    });
    
    console.log(`📂 [GitWorkspace] Opened: ${file.path}`);
  },
  
  // ===== Close File =====
  closeFile: (path) => {
    const { openFiles, activeFilePath } = get();
    const newOpenFiles = openFiles.filter(f => f.path !== path);
    
    let newActivePath = activeFilePath;
    
    // If closing active file, switch to last file or null
    if (activeFilePath === path) {
      if (newOpenFiles.length > 0) {
        newActivePath = newOpenFiles[newOpenFiles.length - 1].path;
      } else {
        newActivePath = null;
      }
    }
    
    set({
      openFiles: newOpenFiles,
      activeFilePath: newActivePath,
    });
    
    console.log(`🗑️ [GitWorkspace] Closed: ${path}`);
  },
  
  // ===== Close All Files =====
  closeAllFiles: () => {
    set({
      openFiles: [],
      activeFilePath: null,
    });
    console.log(`🗑️ [GitWorkspace] Closed all files`);
  },
  
  // ===== Update File Content (from Monaco editor) =====
  updateFileContent: (path, newContent) => {
    const { openFiles, remoteState } = get();
    
    const originalContent = remoteState.get(path) || '';
    const hasChanges = newContent !== originalContent;
    
    // Update open file
    const updatedOpenFiles = openFiles.map(file =>
      file.path === path
        ? { ...file, content: newContent, hasChanges }
        : file
    );
    
    set({ openFiles: updatedOpenFiles });
    
    // Auto-mark as modified if content changed
    if (hasChanges) {
      get().markFileModified(path);
    } else {
      get().unmarkFileModified(path);
    }
  },
  
  // ===== Mark File Modified =====
  markFileModified: (path,restoredContent) => {
     set(state => {
    const newModified = new Set([...state.modifiedFiles, path]);
    
    // If restoring draft content, update openFiles too
    if (restoredContent !== undefined) {
      const existingOpen = state.openFiles.find(f => f.path === path);
      
      if (existingOpen) {
        // File is open — update its content
        return {
          modifiedFiles: newModified,
          openFiles: state.openFiles.map(f =>
            f.path === path
              ? { ...f, content: restoredContent, hasChanges: true }
              : f
          )
        };
      } else {
        // File not open — store content in remoteState won't work,
        // so we add it to openFiles so it's available when user opens it
        const originalContent = state.remoteState.get(path) || '';
        return {
          modifiedFiles: newModified,
          openFiles: [
            ...state.openFiles,
            {
              path,
              content: restoredContent,
              originalContent,
              sha: state.files.find(f => f.path === path)?.sha || '',
              hasChanges: true,
            }
          ]
        };
      }
    }
    
    return { modifiedFiles: newModified };
  });
  },
  
  // ===== Mark File Created =====
  markFileCreated: (path,restoredContent) => {
      set(state => {
    const newCreated = new Set([...state.createdFiles, path]);
    
    if (restoredContent !== undefined) {
      const existingOpen = state.openFiles.find(f => f.path === path);
      
      if (!existingOpen) {
        return {
          createdFiles: newCreated,
          openFiles: [
            ...state.openFiles,
            {
              path,
              content: restoredContent,
              originalContent: '',  // created files have no original
              sha: '',
              hasChanges: true,
            }
          ]
        };
      }
      return {
        createdFiles: newCreated,
        openFiles: state.openFiles.map(f =>
          f.path === path
            ? { ...f, content: restoredContent, hasChanges: true }
            : f
        )
      };
    }
    
    return { createdFiles: newCreated };
  });
  },
  
  // ===== Mark File Deleted =====
  markFileDeleted: (path) => {
    set(state => {
    const isLocalOnly = state.createdFiles.has(path)
    
    if (isLocalOnly) {
      // Was never on GitHub — just remove from created, don't add to deleted
      const newCreated = new Set(state.createdFiles)
      newCreated.delete(path)
      return { 
        createdFiles: newCreated,
        modifiedFiles: new Set([...state.modifiedFiles].filter(p => p !== path))
      }
    }
    
    // Real GitHub file — stage for deletion
    return {
      deletedFiles: new Set([...state.deletedFiles, path]),
      modifiedFiles: new Set([...state.modifiedFiles].filter(p => p !== path))
    }
  });
  console.log(`🗑️ [GitWorkspace] Marked deleted: ${path}`);
  },
  
  // ===== Unmark File Modified =====
  unmarkFileModified: (path) => {
    set(state => {
      const newModified = new Set(state.modifiedFiles);
      newModified.delete(path);
      return { modifiedFiles: newModified };
    });
    console.log(`↩️ [GitWorkspace] Unmarked modified: ${path}`);
  },

  stageFile: (path) => {
    set(state => ({
      stagedFiles: new Set([...state.stagedFiles, path])
    }));
    console.log(`➕ [GitWorkspace] Staged: ${path}`);
    toast.success(`Staged ${path.split('/').pop()}`);
  },
  
  unstageFile: (path) => {
    set(state => {
      const newStaged = new Set(state.stagedFiles);
      newStaged.delete(path);
      return { stagedFiles: newStaged };
    });
    console.log(`➖ [GitWorkspace] Unstaged: ${path}`);
    toast.success(`Unstaged ${path.split('/').pop()}`);
  },
  
  stageAllFiles: () => {
    const { modifiedFiles, createdFiles, deletedFiles } = get();
    const allChangedFiles = new Set([
      ...modifiedFiles,
      ...createdFiles,
      ...deletedFiles
    ]);
    
    set({ stagedFiles: allChangedFiles });
    console.log(`➕ [GitWorkspace] Staged all ${allChangedFiles.size} files`);
    toast.success(`Staged ${allChangedFiles.size} files`);
  },
  
  unstageAllFiles: () => {
    set({ stagedFiles: new Set() });
    console.log(`➖ [GitWorkspace] Unstaged all files`);
    toast.success(`Unstaged all files`);
  },
  unmarkFileCreated: (path) => {
  set(state => {
    const newCreated = new Set(state.createdFiles);
    newCreated.delete(path);
    return { createdFiles: newCreated };
  });
  console.log(`↩️ [GitWorkspace] Unmarked created: ${path}`);
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
    const { openFiles, remoteState } = get();
    
    const originalContent = remoteState.get(path);
    if (!originalContent) {
      toast.error('Cannot restore: original content not found');
      return;
    }
    
    // Restore original content in open file
    const updatedOpenFiles = openFiles.map(file =>
      file.path === path
        ? { ...file, content: originalContent, hasChanges: false }
        : file
    );
    
    set({ openFiles: updatedOpenFiles });
    
    // Remove from modified set
    get().unmarkFileModified(path);
    
    toast.success(`Discarded changes to ${path.split('/').pop()}`);
    console.log(`↩️ [GitWorkspace] Discarded changes: ${path}`);
  },
  
  // ===== Discard All Changes =====
  discardAllChanges: () => {
    const { modifiedFiles, openFiles, remoteState } = get();
    
    // Restore all modified files
    const updatedOpenFiles = openFiles.map(file => {
      if (modifiedFiles.has(file.path)) {
        const originalContent = remoteState.get(file.path) || file.originalContent;
        return { ...file, content: originalContent, hasChanges: false };
      }
      return file;
    });
    
    set({
      openFiles: updatedOpenFiles,
      modifiedFiles: new Set(),
      createdFiles: new Set(),
      deletedFiles: new Set(),
      stagedFiles: new Set(),
    });
    
    toast.success('All changes discarded');
    console.log(`↩️ [GitWorkspace] Discarded all changes`);
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
    set(state => ({
      files: [...state.files, file]
    }));
    console.log(`➕ [GitWorkspace] Added to tree: ${file.path}`);
  },
  
  // ===== Remove File from Tree =====
  removeFileFromTree: (path) => {
    set(state => ({
      files: state.files.filter(f => f.path !== path)
    }));
    console.log(`➖ [GitWorkspace] Removed from tree: ${path}`);
  },
  
  // ===== Update File in Tree =====
  updateFileInTree: (path, updates) => {
    set(state => ({
      files: state.files.map(f =>
        f.path === path ? { ...f, ...updates } : f
      )
    }));
    console.log(`🔄 [GitWorkspace] Updated in tree: ${path}`);
  },
  
  // ===== Reset =====
  reset: () => {
    set(initialState);
    console.log(`🔄 [GitWorkspace] Reset`);
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