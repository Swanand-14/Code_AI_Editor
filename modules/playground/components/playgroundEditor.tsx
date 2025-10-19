"use client"
import { useRef,useState,useCallback,useEffect } from 'react'
import Editor,{type Monaco} from '@monaco-editor/react'
import { configureMonaco,defaultEditorOptions,getEditorLanguage } from '../lib/editor-config'
import type { TemplateFile } from '@/modules/playground/lib/path-to-json'

import React from 'react'

interface PlaygroundEditorProps {
    activeFile: TemplateFile|undefined
    content:string,
    onContentChange:(value:string|undefined)=>void
}
const playgroundEditor = ({activeFile,content,onContentChange}:PlaygroundEditorProps) =>{
const editorRef = useRef<any>(null);
const monacoRef = useRef<Monaco|null>(null);
const handleEditorDidMount = (editor:any,monaco:Monaco)=>{
    editorRef.current = editor
    monacoRef.current = monaco
    console.log("Editor instance mounted:",!!editorRef.current)
    editor.updateOptions({
        ...defaultEditorOptions,

    })
    configureMonaco(monaco)
    updateEditorLanguage()
}
const updateEditorLanguage = () => {
    if (!activeFile || !monacoRef.current || !editorRef.current) return
    const model = editorRef.current.getModel()
    if (!model) return

    const language = getEditorLanguage(activeFile.fileExtension || "")
    try {
      monacoRef.current.editor.setModelLanguage(model, language)
    } catch (error) {
      console.warn("Failed to set editor language:", error)
    }
  }

useEffect(()=>{
    updateEditorLanguage()
},[activeFile?.fileExtension])

  return (
    <div className='h-full w-full relative'>
        <Editor height={"100%"}
        width={"100%"}
        value={content}
        onChange={(value)=>onContentChange(value||"")}
        onMount={handleEditorDidMount}
        language={activeFile?getEditorLanguage(activeFile.fileExtension||"") :"plaintext"}
        
        options={defaultEditorOptions}
        />
    </div>
  )
}

export default playgroundEditor