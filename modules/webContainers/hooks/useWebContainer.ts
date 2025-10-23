import { useState,useEffect,useCallback } from "react";
import { WebContainer } from "@webcontainer/api";

import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { TruckElectric } from "lucide-react";

interface UseWebContainerProps{
    templateData:TemplateFolder
}

interface UseWebContainerReturn{
    severUrl:string|null;
    isLoading:boolean;
    error:string|null;
    instance:WebContainer|null;
    writeFileSync:(path:string,content:string)=>Promise<void>;
    destroy:()=>void;
}

export const useWebContainer = ({templateData}:UseWebContainerProps):UseWebContainerReturn=>{
    const [serverUrl,setServerUrl] = useState<string|null>(null);
    const [isLoading,setIsloading] = useState<boolean>(true);
    const [error,setError] = useState<string|null>(null);
    const [instance,setInstance] = useState<WebContainer|null>(null);
    useEffect(()=>{
        let mounted = true;
        async function initializeWebcontainer(){
            try {
                const webContainerInstance = await WebContainer.boot();
                if(!mounted){
                    return;
                }
                setInstance(webContainerInstance);
                setIsloading(false);
            } catch (error) {
                console.error('Failed to initialize WebCnntainer:',error);
                if(mounted){
                    setError(error instanceof Error?error.message:'Failed to initialize Webcontainer');
                    setIsloading(false);
                }
            }
        }

        initializeWebcontainer();
        return ()=>{
            mounted=false;
            if(instance){
                instance.teardown();
            }

        }

    },[])

    const writeFileSync = useCallback(async(path:string,content:string):Promise<void>=>{
       if(!instance){
        throw new Error('WebContainer instance is not available')

       }
       try {
        const pathParts = path.split("/")
        const folderPath = pathParts.slice(0,-1).join("/");
        if(folderPath){
            await instance.fs.mkdir(folderPath,{recursive:true});

        }
        await instance.fs.writeFile(path,content);


       } catch (err) {
        const errorMessage = err instanceof Error ? err.message:'Failed to write file'
        console.error(`Failed to write file at ${path}:`,err);
        throw new Error(`Failed to write file at ${path}:${errorMessage}`)
        
       }
    },[instance])

    const destroy = useCallback(()=>{
        if(instance){
            instance.teardown();
            setInstance(null);
            setServerUrl(null);
        }
    },[instance])

    return {
        severUrl:serverUrl,
        isLoading,
        error,
        instance,
        writeFileSync,
        destroy 
    }



}