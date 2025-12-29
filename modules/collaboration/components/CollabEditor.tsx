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

export function CollabEditor({
  sessionId,
  userId,
  userName,
  fileId,
  filePath,
  initialContent,
  language,
  onContentChange,
}: CollabEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [content, setContent] = useState<string>(initialContent);
  const isRemoteChange = useRef<boolean>(false);
  const cursorUpdateTimeout = useRef<NodeJS.Timeout | null>(null);
  const previousFileId = useRef<string>(fileId);
  
  // 🔥 FIX: Track if this is the initial mount
  const isInitialMount = useRef<boolean>(true);

  const { socket, isConnected, emitCursorMove, emitEditorChange } = useCollabSocket(
    sessionId,
    userId,
    userName
  );

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
            changes: [],
            timestamp: Date.now(),
          });
        }
      }
    },
    [fileId, filePath, emitEditorChange, onContentChange]
  );

  // 🔥 FIX: Listen for remote changes
  useEffect(() => {
    if (!socket) return;

    const handleRemoteChange = (payload: {
      userId: string;
      userName: string;
      fileId: string;
      content: string;
    }) => {
      // Only apply if it's for this file and from another user
      if (payload.fileId === fileId && payload.userId !== userId) {
        console.log(`📝 Remote change from ${payload.userName} on ${payload.fileId}`);
        
        isRemoteChange.current = true;
        const editor = editorRef.current;
        
        if (editor) {
          const currentPosition = editor.getPosition();
          const currentScrollTop = editor.getScrollTop();
          
          // Update content
          setContent(payload.content);
          editor.setValue(payload.content);
          
          // Restore cursor and scroll position
          if (currentPosition) {
            editor.setPosition(currentPosition);
          }
          editor.setScrollTop(currentScrollTop);
        }
        
        setTimeout(() => {
          isRemoteChange.current = false;
        }, 50);
      }
    };

    const handleRemoteCursor = (payload: {
      userId: string;
      userName: string;
      fileId: string;
      position: { lineNumber: number; column: number };
    }) => {
      if (payload.fileId === fileId && payload.userId !== userId) {
        console.log(`👆 Remote cursor from ${payload.userName} on file ${fileId}`);
        // TODO - render cursor decoration
      }
    };

    socket.on("editor:change", handleRemoteChange);
    socket.on("cursor:move", handleRemoteCursor);

    return () => {
      socket.off("editor:change", handleRemoteChange);
      socket.off("cursor:move", handleRemoteCursor);
    };
  }, [socket, fileId, userId]);

  // 🔥 FIX: Only update editor when switching files, NOT on every content change
  useEffect(() => {
    // Check if the file has actually changed
    const fileChanged = previousFileId.current !== fileId;
    
    if (fileChanged || isInitialMount.current) {
      console.log(`📂 Switching to file: ${fileId}`);
      
      // Update content
      setContent(initialContent);
      
      if (editorRef.current) {
        isRemoteChange.current = true;
        editorRef.current.setValue(initialContent);
        
        // Reset cursor to start when switching files
        editorRef.current.setPosition({ lineNumber: 1, column: 1 });
        
        setTimeout(() => {
          isRemoteChange.current = false;
        }, 50);
      }
      
      // Update refs
      previousFileId.current = fileId;
      isInitialMount.current = false;
    }
    // ❌ DON'T update on initialContent changes - that causes cursor jumps!
  }, [fileId]); // ✅ Only depend on fileId, NOT initialContent

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