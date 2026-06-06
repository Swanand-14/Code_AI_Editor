import {create} from 'zustand';
import { toast } from 'sonner';
import type { TemplateFile,TemplateFolder } from '../lib/path-to-json';

import { generateFileId } from '../lib';
interface OpenFile extends TemplateFile{
    id:string;
    hasUnsavedChanges:boolean;
    
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
    handleAddFile: (
    newFile: TemplateFile,
    parentPath: string,
    writeFileSync: (filePath: string, content: string) => Promise<void>,
    instance: any,
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  handleAddFolder: (
    newFolder: TemplateFolder, 
    parentPath: string, 
    instance: any, 
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  handleDeleteFile: (
    file: TemplateFile, 
    parentPath: string, 
    instance: any, 
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  handleDeleteFolder: (
    folder: TemplateFolder,
    parentPath: string,
    instance: any, 
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  handleRenameFile: (
    file: TemplateFile,
    newFilename: string,
    newExtension: string,
     
    parentPath: string,
    instance: any,
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  handleRenameFolder: (
    folder: TemplateFolder,
    newFolderName: string,
     
    parentPath: string,
    instance: any,
    saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder | null>
  ) => Promise<void>;
  updateFileContent: (fileId: string, content: string) => void;
}



function findFolderByPath(root: TemplateFolder, pathParts: string[]): TemplateFolder {
  let current = root;
  for (const part of pathParts) {
    const next = current.items.find(
      (item) => "folderName" in item && item.folderName === part
    ) as TemplateFolder | undefined;
    if (next) current = next;
  }
  return current;
}

export const initialState = {
  playgroundId: "",
  templateData: null as TemplateFolder | null,
  openFiles: [] as OpenFile[],
  activeFileId: null as string | null,
  editorContent: "",
};
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
        const templateData = get().templateData;
        const fileId = generateFileId(file,templateData!);
        const {openFiles} = get();
        const existingFile = openFiles.find((f)=>f.id === fileId)
        if(existingFile){
            set({activeFileId:fileId,editorContent:existingFile.content})
            return;
        }
        
        // Find the actual correct file from the template to ensure we have the right content
        // This prevents stale/incorrect content from being used when multiple files have the same name
        let correctFileContent = file.content || "";
        
        // Search the template for the file with matching ID to get fresh/correct content
        if (templateData && file.path !== undefined) {
          const findFileInTemplate = (folder: any): any => {
            for (const item of folder.items || []) {
              if ('folderName' in item) {
                const found = findFileInTemplate(item);
                if (found) return found;
              } else {
                // Check if this is the same file
                if (
                  item.filename === file.filename &&
                  item.fileExtension === file.fileExtension &&
                  item.path === file.path
                ) {
                  return item;
                }
              }
            }
            return null;
          };
          
          const correctFile = findFileInTemplate(templateData);
          if (correctFile && correctFile.content) {
            correctFileContent = correctFile.content;
          }
        }
        
        const newOpenFile:OpenFile={
            ...file,
            id:fileId,
            hasUnsavedChanges:false,
            content:correctFileContent,
            originalContent:correctFileContent

        }

        set((state)=>({
            openFiles:[...state.openFiles,newOpenFile],
            activeFileId:fileId,
            editorContent:correctFileContent,
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
    },
    handleAddFile: async(newFile, parentPath, writeFileSync, instance, saveTemplateData)=> {
  const { templateData } = get();
  if (!templateData) return;

  try {
    // Build the full file path
    const filePath = parentPath
      ? `${parentPath}/${newFile.filename}.${newFile.fileExtension}`
      : `${newFile.filename}.${newFile.fileExtension}`;

      const targetFolder = findFolderByPath(
      JSON.parse(JSON.stringify(templateData)) as TemplateFolder,
      parentPath.split("/").filter(Boolean)
    );
    const duplicate = targetFolder.items.find(
      (item) =>
        "filename" in item &&
        item.filename === newFile.filename &&
        item.fileExtension === newFile.fileExtension
    );
    if (duplicate) {
      toast.error(
        `"${newFile.filename}.${newFile.fileExtension}" already exists in this directory`
      );
      return;
    }
    
    console.log(`🆕 Creating new file: ${filePath}`);


    // Use smart default content if file is empty
    const fileContent = newFile.content;

    //  CRITICAL: Write to WebContainer FIRST
    if (instance && instance.fs) {
      // Ensure parent directories exist
      const pathParts = filePath.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        try {
          await instance.fs.mkdir(dirPath, { recursive: true });
          console.log(`📁 Created directory: ${dirPath}`);
        } catch (err) {
          console.log(`Directory ${dirPath} already exists`);
        }
      }

      // Write the file with content
      await instance.fs.writeFile(filePath, fileContent,'utf-8');
      console.log(`File written to WebContainer: ${filePath}`);
    } else {
      console.error(" writeFileSync or instance not available!");
    }

    // Update templateData
    const updatedTemplateData = JSON.parse(JSON.stringify(templateData)) as TemplateFolder;
    const pathParts = parentPath.split("/").filter(Boolean);
    let currentFolder = updatedTemplateData;
   

    for (const part of pathParts) {
      const nextFolder = currentFolder.items.find(
        (item) => "folderName" in item && item.folderName === part
      ) as TemplateFolder;
      if (nextFolder) currentFolder = nextFolder;
    }

    // Add file with path and content
    const fileWithPath = {
      ...newFile,
      content: fileContent, //  Use default content
      path: parentPath || ""
    };

    currentFolder.items.push(fileWithPath);
    set({ templateData: updatedTemplateData });

    // Save to database
    await saveTemplateData(updatedTemplateData);
    
    toast.success(`Created: ${newFile.filename}.${newFile.fileExtension}`);

    // Open the file
    get().openFile(fileWithPath);
    
  } catch (error) {
    console.error("❌ Error adding file:", error);
    toast.error("Failed to create file");
  }
},

    handleAddFolder: async (newFolder, parentPath, instance, saveTemplateData) => {
  const { templateData } = get();
  if (!templateData) return;

  try {
    const folderPath = parentPath
      ? `${parentPath}/${newFolder.folderName}`
      : newFolder.folderName;
    
    console.log(`🆕 Creating new folder: ${folderPath}`);

   
    if (instance && instance.fs) {
      await instance.fs.mkdir(folderPath, { recursive: true });
      console.log(`✅ Folder created in WebContainer: ${folderPath}`);
    }

    // Now update templateData
    const updatedTemplateData = JSON.parse(JSON.stringify(templateData)) as TemplateFolder;
    const pathParts = parentPath.split("/").filter(Boolean);
    let currentFolder = updatedTemplateData;

    for (const part of pathParts) {
      const nextFolder = currentFolder.items.find(
        (item) => "folderName" in item && item.folderName === part
      ) as TemplateFolder;
      if (nextFolder) currentFolder = nextFolder;
    }

    currentFolder.items.push(newFolder);
    set({ templateData: updatedTemplateData });
    
    await saveTemplateData(updatedTemplateData);
    toast.success(`Created folder: ${newFolder.folderName}`);
    
  } catch (error) {
    console.error("❌ Error adding folder:", error);
    toast.error("Failed to create folder");
  }
},
    handleDeleteFile: async (file, parentPath,instance:any, saveTemplateData) => {
    const { templateData, openFiles } = get();
    if (!templateData) return;

    try {

      const filePath = parentPath
          ? `${parentPath}/${file.filename}.${file.fileExtension}`
          : `${file.filename}.${file.fileExtension}`;

       console.log(`🗑️ Deleting file from WebContainer: ${filePath}`);
        
        if (instance && instance.fs) {
          try {
            await instance.fs.rm(filePath);
            console.log(`✅ File deleted from WebContainer: ${filePath}`);
          } catch (error) {
            console.warn(`⚠️ File may not exist in WebContainer: ${filePath}`, error);
          }
        }

      const updatedTemplateData = JSON.parse(
        JSON.stringify(templateData)
      ) as TemplateFolder;
      const pathParts = parentPath.split("/");
      let currentFolder = updatedTemplateData;

      for (const part of pathParts) {
        if (part) {
          const nextFolder = currentFolder.items.find(
            (item) => "folderName" in item && item.folderName === part
          ) as TemplateFolder;
          if (nextFolder) currentFolder = nextFolder;
        }
      }

      currentFolder.items = currentFolder.items.filter(
        (item) =>
          !("filename" in item) ||
          item.filename !== file.filename ||
          item.fileExtension !== file.fileExtension
      );

      // Find and close the file if it's open
      // Use the same ID generation logic as in openFile
      const fileId = generateFileId(file, templateData);
      const openFile = openFiles.find((f) => f.id === fileId);
      
      if (openFile) {
        // Close the file using the closeFile method
        get().closeFile(fileId);
      }

      set({ templateData: updatedTemplateData });

      // Use the passed saveTemplateData function
      await saveTemplateData(updatedTemplateData);
      toast.success(`Deleted file: ${file.filename}.${file.fileExtension}`);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    }
  },
  handleDeleteFolder: async (folder, parentPath, instance, saveTemplateData) => {
    const { templateData } = get();
    if (!templateData) return;
 
    try {
      const folderPath = parentPath
        ? `${parentPath}/${folder.folderName}`
        : folder.folderName;
 
      if (instance && instance.fs) {
        try {
          await instance.fs.rm(folderPath, { recursive: true, force: true });
        } catch (error) {}
      }
 
      const updatedTemplateData = JSON.parse(JSON.stringify(templateData)) as TemplateFolder;
      const pathParts = parentPath.split("/");
      let currentFolder = updatedTemplateData;
 
      for (const part of pathParts) {
        if (part) {
          const nextFolder = currentFolder.items.find(
            (item) => "folderName" in item && item.folderName === part
          ) as TemplateFolder;
          if (nextFolder) currentFolder = nextFolder;
        }
      }
 
      currentFolder.items = currentFolder.items.filter(
        (item) => !("folderName" in item) || item.folderName !== folder.folderName
      );
 
      // FIX: Find the folder in templateData (not the passed argument) so that
      // items have the correct `path` property set, which generateFileId needs
      // to produce the same ID that was assigned when the file was opened.
      const findFolderInTemplate = (
        root: TemplateFolder,
        targetName: string,
        parentPath: string
      ): TemplateFolder | null => {
        for (const item of root.items) {
          if ("folderName" in item) {
            const itemPath = parentPath ? `${parentPath}/${item.folderName}` : item.folderName;
            if (item.folderName === targetName && itemPath === (parentPath ? `${parentPath}/${targetName}` : targetName)) {
              return item;
            }
            const found = findFolderInTemplate(item, targetName, itemPath);
            if (found) return found;
          }
        }
        return null;
      };
 
      const folderInTemplate = findFolderInTemplate(
        templateData,
        folder.folderName,
        parentPath
      );
 
      const closeFilesInFolder = (f: TemplateFolder, currentPath: string = "") => {
        f.items.forEach((item) => {
          if ("filename" in item) {
            // item.path is correctly set because it comes from templateData
            const fileId = generateFileId(item, templateData);
            get().closeFile(fileId);
          } else if ("folderName" in item) {
            const newPath = currentPath
              ? `${currentPath}/${item.folderName}`
              : item.folderName;
            closeFilesInFolder(item, newPath);
          }
        });
      };
 
      if (folderInTemplate) {
        closeFilesInFolder(
          folderInTemplate,
          parentPath ? `${parentPath}/${folder.folderName}` : folder.folderName
        );
      }
 
      set({ templateData: updatedTemplateData });
      await saveTemplateData(updatedTemplateData);
      toast.success(`Deleted folder: ${folder.folderName}`);
    } catch (error) {
      toast.error("Failed to delete folder");
    }
  },
    handleRenameFolder: async (folder, newFolderName, parentPath, instance:any,saveTemplateData) => {
    const { templateData } = get();
    if (!templateData) return;

    try {

       const oldPath = parentPath
          ? `${parentPath}/${folder.folderName}`
          : folder.folderName;
        
        const newPath = parentPath
          ? `${parentPath}/${newFolderName}`
          : newFolderName;
        
        console.log(`✏️ Renaming folder in WebContainer: ${oldPath} → ${newPath}`);
        
        if (instance && instance.fs) {
          try {
            // Create new folder
            await instance.fs.mkdir(newPath, { recursive: true });
            
            // Copy all contents recursively
            const copyDir = async (src: string, dest: string) => {
              const entries = await instance.fs.readdir(src, { withFileTypes: true });
              
              for (const entry of entries) {
                const srcPath = `${src}/${entry.name}`;
                const destPath = `${dest}/${entry.name}`;
                
                if (entry.isDirectory()) {
                  await instance.fs.mkdir(destPath, { recursive: true });
                  await copyDir(srcPath, destPath);
                } else {
                  const content = await instance.fs.readFile(srcPath, 'utf-8');
                  await instance.fs.writeFile(destPath, content, 'utf-8');
                }
              }
            };
            
            await copyDir(oldPath, newPath);
            
            // Delete old folder
            await instance.fs.rm(oldPath, { recursive: true, force: true });
            console.log(`✅ Folder renamed in WebContainer`);
          } catch (error) {
            console.warn(`⚠️ Error renaming folder in WebContainer:`, error);
          }
        }
      const updatedTemplateData = JSON.parse(
        JSON.stringify(templateData)
      ) as TemplateFolder;
      const pathParts = parentPath.split("/");
      let currentFolder = updatedTemplateData;

      for (const part of pathParts) {
        if (part) {
          const nextFolder = currentFolder.items.find(
            (item) => "folderName" in item && item.folderName === part
          ) as TemplateFolder;
          if (nextFolder) currentFolder = nextFolder;
        }
      }

      const folderIndex = currentFolder.items.findIndex(
        (item) => "folderName" in item && item.folderName === folder.folderName
      );

      if (folderIndex !== -1) {
        const updatedFolder = {
          ...currentFolder.items[folderIndex],
          folderName: newFolderName,
        } as TemplateFolder;
        currentFolder.items[folderIndex] = updatedFolder;

        set({ templateData: updatedTemplateData });

        // Use the passed saveTemplateData function
        await saveTemplateData(updatedTemplateData);
        toast.success(`Renamed folder to: ${newFolderName}`);
      }
    } catch (error) {
      console.error("Error renaming folder:", error);
      toast.error("Failed to rename folder");
    }
  },
  updateFileContent: (fileId, content) => {
    set((state) => ({
      openFiles: state.openFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              content,
              hasUnsavedChanges: content !== file.originalContent,
            }
          : file
      ),
      editorContent:
        fileId === state.activeFileId ? content : state.editorContent,
    }));
  },

  handleRenameFile:async(file,newFilename,newExtension,parentPath,instance:any,saveTemplateData)=>{
    const { templateData,openFiles } = get();
    if (!templateData) return;

    try {
      const oldPath = parentPath
          ? `${parentPath}/${file.filename}.${file.fileExtension}`
          : `${file.filename}.${file.fileExtension}`;
        
        const newPath = parentPath
          ? `${parentPath}/${newFilename}.${newExtension}`
          : `${newFilename}.${newExtension}`;

           const targetFolder = findFolderByPath(
        JSON.parse(JSON.stringify(templateData)) as TemplateFolder,
        parentPath.split("/").filter(Boolean)
      );
      const duplicate = targetFolder.items.find(
        (item) =>
          "filename" in item &&
          item.filename === newFilename &&
          item.fileExtension === newExtension &&
          // Exclude the file being renamed itself
          !(item.filename === file.filename && item.fileExtension === file.fileExtension)
      );
      if (duplicate) {
        toast.error(
          `"${newFilename}.${newExtension}" already exists in this directory`
        );
        return;
      }
        
        console.log(`✏️ Renaming file in WebContainer: ${oldPath} → ${newPath}`);
         const updatedTemplateData = JSON.parse(JSON.stringify(templateData)) as TemplateFolder;
      const pathParts = parentPath.split("/");
      let currentFolder = updatedTemplateData;
      
        
        if (instance && instance.fs) {
          try {
            // Read the old file content
            const content = await instance.fs.readFile(oldPath, 'utf-8');
            // Write to new path
            await instance.fs.writeFile(newPath, content, 'utf-8');
            // Delete old file
            try {
            await instance.fs.rm(oldPath, { force: true });
            console.log(`✅ Old file deleted from WebContainer: ${oldPath}`);
          } catch (rmError) {
            // Fallback: try without options
            console.warn(`⚠️ rm with options failed, trying plain rm:`, rmError);
            await instance.fs.rm(oldPath);
          }
            console.log(`✅ File renamed in WebContainer`);
          } catch (error) {
            console.warn(`⚠️ Error renaming file in WebContainer:`, error);
          }
        }
     

      for (const part of pathParts) {
        if (part) {
          const nextFolder = currentFolder.items.find(
            (item) => "folderName" in item && item.folderName === part
          ) as TemplateFolder;
          if (nextFolder) currentFolder = nextFolder;
        }
      }

      const fileIndex = currentFolder.items.findIndex(
        (item) =>
          "filename" in item &&
          item.filename === file.filename &&
          item.fileExtension === file.fileExtension
      );

      if (fileIndex !== -1) {
        const updatedFile = {
          ...currentFolder.items[fileIndex],
          filename: newFilename,
          fileExtension: newExtension,
        } as TemplateFile;
        currentFolder.items[fileIndex] = updatedFile;

        // Update open files if the renamed file is open
        const oldFileId = generateFileId(file, templateData);
        const openFile = openFiles.find((f) => f.id === oldFileId);
        if (openFile) {
          const newFileId = generateFileId(updatedFile, templateData);
          get().setOpenFiles(
            openFiles.map((f) =>
              f.id === oldFileId ? { ...f, id: newFileId } : f
            )
          );
          // If the renamed file is the active file, update activeFileId
          if (get().activeFileId === oldFileId) {
            get().setActiveFileId(newFileId);
          }
        }

        set({ templateData: updatedTemplateData });

        // Use the passed saveTemplateData function
        await saveTemplateData(updatedTemplateData);
        toast.success(`Renamed file to: ${newFilename}.${newExtension}`);
      }
    } catch (error) {
      console.error("Error renaming file:", error);
      toast.error("Failed to rename file");
    }
  }




   

})
)
