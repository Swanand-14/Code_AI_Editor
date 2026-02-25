import { useEffect, useRef } from 'react';
import { useGitWorkspace } from './Usegitworkspace';
import { toast } from 'sonner';
import { saveWorkspaceDraft } from '../actions';

interface AutosaveOptions {
  repoFullName: string;
  currentBranch: string;
  enabled: boolean;
  intervalMs?: number; // Default: 10000 (10 seconds)
}

export function useWorkspaceAutosave({
  repoFullName,
  currentBranch,
  enabled,
  intervalMs = 10000,
}: AutosaveOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<string>(''); // Hash of last saved state
  
  const getAllChanges = useGitWorkspace(state => state.getAllChanges);
  const hasUnsavedChanges = useGitWorkspace(state => state.hasUnsavedChanges);
  const openFiles = useGitWorkspace(state => state.openFiles);
  
  useEffect(() => {
    if (!enabled || !repoFullName || !currentBranch) {
      return;
    }
    
    console.log(`🔄 [Autosave] Started for ${repoFullName} (${currentBranch})`);
    
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Autosave function
    const autosave = async () => {
      if (!hasUnsavedChanges()) {
        return; // No changes to save
      }
      
      const changes = getAllChanges();
      
      // Build draft object
      const draft = {
        repoFullName,
        branch: currentBranch,
        modifiedFiles: changes
          .filter(c => c.type === 'modified')
          .map(c => ({
            path: c.path,
            content: c.content || '',
            sha: c.oldSha || '',
          })),
        createdFiles: changes
          .filter(c => c.type === 'created')
          .map(c => ({
            path: c.path,
            content: c.content || '',
          })),
        deletedFiles: changes
          .filter(c => c.type === 'deleted')
          .map(c => c.path),
      };
      
      // Create hash to detect if state changed
      const currentHash = JSON.stringify(draft);
      
      // Skip if nothing changed since last save
      if (currentHash === lastSaveRef.current) {
        return;
      }
      
      // Save to MongoDB
      const result = await saveWorkspaceDraft(draft);
      
      if (result.success) {
        lastSaveRef.current = currentHash;
        console.log(`💾 [Autosave] Saved ${changes.length} changes`);
      } else {
        console.error(`❌ [Autosave] Failed:`, result.error);
        // Don't spam user with errors, just log
      }
    };
    
    // Run autosave immediately
    autosave();
    
    // Then run every intervalMs
    intervalRef.current = setInterval(autosave, intervalMs);
    
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log(`🛑 [Autosave] Stopped`);
      }
    };
  }, [repoFullName, currentBranch, enabled, intervalMs, getAllChanges, hasUnsavedChanges]);
}