import {create} from 'zustand';
import { toast } from 'sonner';
import { TemplateFile,TemplateFolder } from '../lib/path-to-json';
import { Field } from 'react-hook-form';
import { generateFileId } from '../lib';
interface OpenFile extends TemplateFile{
    id:string;
    hasUnsavedChanges:boolean;
    content:string;
    originalContent:string
}
interface FileExplorerState{
    playgroundId:String;
    templateData:TemplateFolder|null;
    openFiles:OpenFile[];
    activeFileId:string|null;
    editorContent:string;

    setPlaygroundId:(id:string)=>void;
    setTemplateData:(data:TemplateFolder|null)=>void;
    setEditorContent:(content:string)=>void;
    setOpenFiles:(files:OpenFile[])=>void;
    setActiveFileId:(fileId:string|null)=>void;

    openFile:(file:TemplateFile)=>void;
    closeFile:(FileId:string)=>void;
    closeAllFiles:()=>void;
}
// @ts-ignore
export const useFileExplorer = create<FileExplorerState>((set,get)=>({
    playgroundId:"",
    templateData:null,
    openFiles:[],
    activeFileId:null,
    editorContent:"",

    setPlaygroundId:(id:string)=>set({playgroundId:id}),
    setTemplateData:(data:TemplateFolder|null)=>set({templateData:data}),
    setEditorContent:(content:string)=>set({editorContent:content}),
    setOpenFiles:(files:OpenFile[])=>set({openFiles:files}),
    setActiveFileId:(fileId:string|null)=>set({activeFileId:fileId}),
    openFile:(file)=>{
        const fileId = generateFileId(file,get().templateData!);
        const {openFiles} = get();
        const existingFile = openFiles.find((f)=>f.id === fileId)
        if(existingFile){
            set({activeFileId:fileId,editorContent:existingFile.content})
            return;
        }
        const newOpenFile:OpenFile={
            ...file,
            id:fileId,
            hasUnsavedChanges:false,
            content:file.content||"",
            originalContent:file.content||""

        }

        set((state)=>({
            openFiles:[...state.openFiles,newOpenFile],
            activeFileId:fileId,
            editorContent:file.content||"",
        }))
    },

    closeFile:(fileId)=>{
        const {openFiles,activeFileId} = get()
        const newFiles = openFiles.filter((f)=>f.id!==fileId)
        let newActiveFileId = activeFileId;
        let newEditorContent = get().editorContent
        if(activeFileId===fileId){
            if(newFiles.length > 0){
               const lastFile = newFiles[newFiles.length-1];
               newActiveFileId = lastFile.id;
               newEditorContent = lastFile.content
            }else{
                newActiveFileId = null;
                newEditorContent = "";
            }

        }
        set({
            openFiles:newFiles,
            activeFileId:newActiveFileId,
            editorContent:newEditorContent
        })
    },
    closeAllFiles:()=>{
        set({
            openFiles:[],
            activeFileId:null,
            editorContent:""
        })
    }

})
)
