"use client";

import { useEffect, useRef, useCallback } from "react";
import { updateCollabWorkspace } from "../workspaces/actions";
import { toast } from "sonner";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

export function useWorkspaceAutoSave(sessionId:string,templateData:TemplateFolder | null,userId?:string,enabled:boolean=true){
    const saveTimeoutRef = useRef<NodeJS.Timeout|null>(null);
    const lastSavedRef = useRef<string>("")
    const saveWorkSpace = useCallback(async()=>{
      if(!templateData)return;
      const currentFiles = JSON.stringify(templateData);
    
    // Skip if no changes
    if (currentFiles === lastSavedRef.current) {
      return;
    }

    try {
      const result = await updateCollabWorkspace({
        sessionId,
        templateData,
        userId,
      });

      if (result.success) {
        lastSavedRef.current = currentFiles;
        console.log("💾 Workspace auto-saved");
      } else {
        console.error("❌ Auto-save failed:", result.error);
      }
    } catch (error) {
      console.error("❌ Auto-save error:", error);
    }
    },[sessionId,templateData,userId])
    useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      saveWorkSpace();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [saveWorkSpace, enabled]);
  useEffect(() => {
    if (!enabled) return;

    const handleBlur = () => {
      saveWorkSpace();
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [saveWorkSpace, enabled]);

  // Save on unmount
  useEffect(() => {
    if (!enabled) return;

    return () => {
      saveWorkSpace();
    };
  }, [saveWorkSpace, enabled]);

  return { saveWorkSpace };


}

