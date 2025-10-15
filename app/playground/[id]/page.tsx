"use client"
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { usePlayground } from '@/modules/playground/hooks/usePlayground';
import { Separator } from '@radix-ui/react-dropdown-menu';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useParams } from 'next/navigation'
import React from 'react'
import {TemplateFileTree} from '@/modules/playground/components/playgroundExplorer';

function MainPlaygroundPage() {
    const {id} = useParams<{id:string}>();
    const {playgroundData,templateData,isLoading,error,saveTemplateData} = usePlayground(id)
    console.log("templateData",templateData);
    console.log("playgroundData",playgroundData)
    const activeFile = "sample.txt"
  return (
    <TooltipProvider>
      <>
      <TemplateFileTree 
      data={templateData!}
      onFileSelect={()=>{}}
      selectedFile={activeFile}
      title ="File Explorer"
      onAddFile={()=>{}}
      onAddFolder={()=>{}}
      onDeleteFile={()=>{}}
      onDeleteFolder={()=>{}}
      onRenameFile={()=>{}}
      onRenameFolder={()=>{}}/>
      <SidebarInset>
        <header className='flex h-16 shrink-0 items-center gap-2 boarder-b px-4'>
          <SidebarTrigger className='-ml-1'/>
          {/* @ts-ignore */}
          <Separator orientation='vertical' className='mr-2 h-4'/>
        </header>
        <div className='flex flex-1 items-center gap-2'>
          <div className='flex flex-col flex-1'>
            <h1 className='text-sm font-medium'>
              {playgroundData?.name || "code data"}

            </h1>
          </div>

        </div>
      </SidebarInset>
      </>
    </TooltipProvider>
  )
}

export default MainPlaygroundPage