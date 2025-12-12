import { useState,useEffect,useCallback } from "react";
import {toast} from "sonner"
import type { TemplateFolder } from "../lib/path-to-json";
import { getPlaygroundById, SaveUpdatedCode } from "../action";
import { enrichTemplateWithPaths } from "../lib"; // 🔥 FIX: Import path enrichment function

interface PlaygroundData {
    id:string;
    name?:string;
    [key:string]:any;
}

interface UsePlaygroundReturn{
playgroundData:PlaygroundData | null;
templateData:TemplateFolder | null;
isLoading:boolean;
error:string|null;
loadPlayground:()=>Promise<void>;
saveTemplateData:(data:TemplateFolder)=>Promise<void>;
}
//@ts-ignore
export const usePlayground = (id:string):UsePlaygroundReturn => {
    const [playgroundData,setPlaygroundData] = useState<PlaygroundData|null>(null);
    const [templateData,setTemplateData] = useState<TemplateFolder|null>(null);
    const [isLoading,setIsLoading] = useState<boolean>(false);
    const [error,setError] = useState<string|null>(null);
    const loadPlayground = useCallback(async()=>{
     if(!id) return;
     try {
        setIsLoading(true);
        const data = await getPlaygroundById(id);
        if(!data){
            setError("Playground not found");
            toast.error("Playground not found");
            return;
        }
        setPlaygroundData(data);
        const rawContent = data?.templateFiles?.[0]?.content;
        if(typeof rawContent === "string"){
            const parsedContent = JSON.parse(rawContent);
            // 🔥 FIX: Enrich with path information
            const enrichedTemplate = enrichTemplateWithPaths(parsedContent);
            setTemplateData(enrichedTemplate);
            toast.success("Playground loaded successfully");
            return;
        }
        const res = await fetch(`/api/template/${id}`);
        if(!res.ok){
            throw new Error(`Failed to load template: ${res.status}`)

        }
        const templateRes = await res.json()
        if(templateRes.templateJson && Array.isArray(templateRes.templateJson)){
            // 🔥 FIX: Enrich with path information
            const enrichedTemplate = enrichTemplateWithPaths({
                folderName:"Root",
                items:templateRes.templateJson,
            });
            setTemplateData(enrichedTemplate);
        }else{
            // 🔥 FIX: Enrich with path information
            const enrichedTemplate = enrichTemplateWithPaths(templateRes.templateJson || {
                folderName:"Root",
                items:[],
            });
            setTemplateData(enrichedTemplate);
        }
        toast.success("Template loaded successfully");

     } catch (error) {
        console.error("Error loading playground",error);
        setError("Failed to load playground data");
        toast.error("Failed to load playground data")
        
     }
     finally{
        setIsLoading(false);
     }
    },[id]);
    const saveTemplateData = useCallback(async(data:TemplateFolder)=>{
      try {
        await SaveUpdatedCode(id,data);
        setTemplateData(data);
        toast.success("Changes saved successfully")
        return data;
      } catch (error) {
        console.error("Error saving template data:",error);
        toast.error("Failed to save changes")
        throw error;
      }
    },[id])

    useEffect(()=>{
      loadPlayground()
    },[loadPlayground])

    return{
      playgroundData,
      templateData,
      isLoading,
      error,
      loadPlayground,
      saveTemplateData
    }

}