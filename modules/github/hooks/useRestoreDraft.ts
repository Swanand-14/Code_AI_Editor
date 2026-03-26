import { toast } from "sonner";
import { useGitWorkspace } from "./Usegitworkspace";
import { useState } from "react";
import { loadWorkspaceDraft } from "../actions";
import { file } from "zod";



export function useRestoreDraft() {
  const initializeWorkspace = useGitWorkspace(state => state.initializeWorkspace);
  const syncFileToWebContainer = useGitWorkspace(state => state.syncFileToWebContainer);
  const markFileModified = useGitWorkspace(state => state.markFileModified);
  const markFileCreated = useGitWorkspace(state => state.markFileCreated);
  const markFileDeleted = useGitWorkspace(state => state.markFileDeleted);
  const addFileToTree = useGitWorkspace(state => state.addFileToTree);
  const removeFileFromTree = useGitWorkspace(state => state.removeFileFromTree);
  
  const [isRestoring, setIsRestoring] = useState(false);
  
  const restoreDraft = async (
    repoFullName: string,
    branch: string,
    webContainerInstance: any | null,
    sessionId?:string
  ) => {
    setIsRestoring(true);
    
    try {
      console.log(`🔍 [Draft] Checking for draft: ${repoFullName} (${branch})`);
      
      const result = await loadWorkspaceDraft(repoFullName, branch,sessionId);
      
      if (!result.success || !result.data) {
        console.log(`ℹ️ [Draft] No draft found`);
        setIsRestoring(false);
        return false;
      }
      
      const draft = result.data;
      if(draft.branch !== branch) {
        console.warn(`⚠️ [Draft] Draft branch (${draft.branch}) does not match current branch (${branch})`);
        setIsRestoring(false);
        return false;
      }
      const totalChanges = 
        draft.modifiedFiles.length + 
        draft.createdFiles.length + 
        draft.deletedFiles.length;
      
      console.log(`📂 [Draft] Found draft with ${totalChanges} changes`);
      
      // Show toast
      toast.info(`Found ${totalChanges} unsaved changes from ${
        new Date(draft.lastSaved).toLocaleString()
      }`, {
        duration: 5000,
      });
      
      // Restore modified files to WebContainer
      for (const file of draft.modifiedFiles) {
        // await syncFileToWebContainer(file.path, file.content, webContainerInstance);
        markFileModified(file.path,file.content);
      }
      
      // Restore created files to WebContainer
      for (const file of draft.createdFiles) {
        // await syncFileToWebContainer(file.path, file.content, webContainerInstance);
        addFileToTree({
          name:file.path.split('/').pop() || file.path,
          path:file.path,
          sha:'', // No SHA for new files
          type:'file',
          content:file.content,
          size:file.content.length,
        });
        markFileCreated(file.path,file.content);
      }
      
      // Mark deleted files (don't delete from WebContainer yet)
      for (const path of draft.deletedFiles) {
        removeFileFromTree(path);
        markFileDeleted(path);

      }
      
      console.log(`✅ [Draft] Restored ${totalChanges} changes`);
       if (webContainerInstance) {
      for (const file of [...draft.modifiedFiles, ...draft.createdFiles]) {
        await syncFileToWebContainer(file.path, file.content, webContainerInstance)
      }
    }
      toast.success(`Restored ${totalChanges} unsaved changes`);
      
      setIsRestoring(false);
      return true;
      
    } catch (error) {
      console.error(`❌ [Draft] Failed to restore:`, error);
      toast.error('Failed to restore unsaved changes');
      setIsRestoring(false);
      return false;
    }
  };
  
  return { isRestoring, restoreDraft };
}
