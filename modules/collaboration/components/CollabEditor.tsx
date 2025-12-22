"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { useCollabSocket } from "../hooks/useCollabSocket";
import { Loader2 } from "lucide-react";

interface CollabEditorProps {
  sessionId: string;
  userId?: string;
  userName?: string;
  fileId: string;
  filePath: string;
  initialContent: string;
  language: string;
  onContentChange?: (content: string) => void;
}

export function CollabEditor({sessionId,userId,userName,fileId,filePath,initialContent,language,onContentChange}:CollabEditorProps) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const [content, setContent] = useState<string>(initialContent);
    const isRemoteChange = useRef<boolean>(false);
    const cursorUpdateTimeout = useRef<NodeJS.Timeout | null>(null);
    const { socket, isConnected,emitCursorMove,emitEditorChange } = useCollabSocket(sessionId, userId, userName);
     const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      console.log("✅ Monaco editor mounted for collab");

      // Listen for cursor position changes
      editor.onDidChangeCursorPosition((e) => {
        if (!isRemoteChange.current) {
          // Debounce cursor updates
          if (cursorUpdateTimeout.current) {
            clearTimeout(cursorUpdateTimeout.current);
          }

          cursorUpdateTimeout.current = setTimeout(() => {
            emitCursorMove({
              fileId,
              position: {
                lineNumber: e.position.lineNumber,
                column: e.position.column,
              },
              selection: e.selection
                ? {
                    startLineNumber: e.selection.startLineNumber,
                    startColumn: e.selection.startColumn,
                    endLineNumber: e.selection.endLineNumber,
                    endColumn: e.selection.endColumn,
                  }
                : undefined,
            });
          }, 100);
        }
      });
    },
    [fileId, emitCursorMove]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!value || isRemoteChange.current) return;

      const newContent = value;
      setContent(newContent);
      onContentChange?.(newContent);

      // Emit change to other users
      const editor = editorRef.current;
      if (editor) {
        const model = editor.getModel();
        if (model) {
          emitEditorChange({
            fileId,
            filePath,
            content: newContent,
            changes: [], // We'll send full content for simplicity
            timestamp: Date.now(),
          });
        }
      }
    },
    [fileId, filePath, emitEditorChange, onContentChange]
  );

  useEffect(()=>{
     if(!socket)return;
     const handleRemoteChange = (payload:{
        userId:string;userName:string;fileId:string;content:string
     })=>{
        if(payload.fileId === fileId && payload.userId!==userId){
            console.log(`Remote Change from ${payload.userName} on ${payload.fileId}`)
            isRemoteChange.current = true;
            const editor =editorRef.current ;
            if(editor){
                const currentPosition = editor.getPosition()
                const currentScrollTop = editor.getScrollTop();
                setContent(payload.content);
                editor.setValue(payload.content)
                if(currentPosition){
                    editor.setPosition(currentPosition)

                }
                editor.setScrollTop(currentScrollTop)
            }
            setTimeout(()=>{
                isRemoteChange.current = false;

            },50)
        }
     }

     const handleRemoteCursor = (payload:{
        userId:string,userName:string,fileId:string,position:{lineNumber:number;column:number}
     }) => {
        if(payload.fileId === fileId && payload.userId!==userId){
            console.log(`Remote cursor from ${payload.userName} on file ${fileId}`)
            //Todo - render cursor decoration
        }
     }

     socket.on("editor:change",handleRemoteChange);
     socket.on("cursor:move",handleRemoteCursor);

     return ()=>{
        socket.off("editor:change",handleRemoteChange)
        socket.off("cursor:move",handleRemoteCursor)
     }



     
  },[socket,fileId,userId])

   useEffect(() => {
    setContent(initialContent);
    if (editorRef.current) {
      isRemoteChange.current = true;
      editorRef.current.setValue(initialContent);
      setTimeout(() => {
        isRemoteChange.current = false;
      }, 50);
    }
  }, [fileId, initialContent]);


  return (
    <div className="relative h-full w-full">
      {/* Connection indicator */}
      {!isConnected && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-md text-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reconnecting...
        </div>
      )}

      <Editor
        height="100%"
        language={language}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: "on",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
        }}
      />
    </div>
  );
}