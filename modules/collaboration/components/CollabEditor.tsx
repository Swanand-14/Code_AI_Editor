// components/CollabEditorIntegrated.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCollabSocket} from "../hooks/useCollabSocket";
import { MonacoRemoteCursors, useMonacoCursorTracking } from "./MonacoRemoteCursors";
import { CollisionDetector, useCollisionTracking } from "./CollisionDetector";
import { FileLockIndicator, useFileLock } from "./FileLockIndicator";

interface CollabEditorIntegratedProps {
  sessionId: string;
  userId?: string;
  userName?: string;
  fileId: string;
  filePath: string;
  initialContent: string;
  language: string;
  onContentChange: (content: string) => void;
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
}: CollabEditorIntegratedProps) {
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isActive, setIsActive] = useState(false);
  const contentRef = useRef(initialContent);
  const isRemoteChangeRef = useRef(false);

  // Enhanced socket with awareness features
  const {
    socket,
    remoteCursors,
    participants,
    fileLocks,
    userColor,
    emitCursorMove,
    emitCursorHide,
    emitPresenceUpdate,
    emitFileLock,
    emitTypingStart,
  } = useCollabSocket(sessionId, userId, userName);

  // File lock management
  const { isReadOnly, isLockedByOther, lockedBy } = useFileLock(
    fileId,
    isActive,
    fileLocks,
    userId,
    emitFileLock
  );

  // Handle editor mount
  const handleEditorMount: OnMount = (mountedEditor) => {
    setEditor(mountedEditor);
    setIsActive(true);

    // Update presence when file opens
    emitPresenceUpdate({ fileId, filePath }, false);

    // Focus handler
    mountedEditor.onDidFocusEditorText(() => {
      setIsActive(true);
      emitPresenceUpdate({ fileId, filePath }, false);
    });

    // Blur handler
    mountedEditor.onDidBlurEditorText(() => {
      setIsActive(false);
      emitCursorHide(fileId);
    });
  };

  // Track local cursor
  useMonacoCursorTracking(editor, fileId, (position, selection) => {
    emitCursorMove(fileId, position, selection);
  });

  // Track typing for collision detection
  useCollisionTracking(editor, fileId, (fileId, lineNumber) => {
    emitTypingStart(fileId, lineNumber);
    emitPresenceUpdate({ fileId, filePath }, true);
  });

  // Handle local content changes
  const handleChange = (value: string | undefined) => {
    if (!value || isRemoteChangeRef.current) return;

    contentRef.current = value;
    onContentChange(value);

    // Emit to socket (debounced in parent)
  };

  // Listen for remote changes
  useEffect(() => {
    if (!socket || !editor) return;

    const handleRemoteChange = (payload: {
      userId: string;
      fileId: string;
      content: string;
    }) => {
      if (payload.userId === userId || payload.fileId !== fileId) return;

      // Mark as remote change to prevent echo
      isRemoteChangeRef.current = true;

      // Save cursor position
      const position = editor.getPosition();
      const model = editor.getModel();

      if (model) {
        // Update content
        model.setValue(payload.content);
        contentRef.current = payload.content;

        // Restore cursor position if possible
        if (position) {
          editor.setPosition(position);
        }
      }

      // Reset flag
      setTimeout(() => {
        isRemoteChangeRef.current = false;
      }, 100);
    };

    socket.on("editor:change", handleRemoteChange);

    return () => {
      socket.off("editor:change", handleRemoteChange);
    };
  }, [socket, editor, fileId, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      emitCursorHide(fileId);
      emitPresenceUpdate(undefined, false);
    };
  }, [fileId]);

  return (
    <div className="relative h-full">
      {/* File Lock Indicator */}
      <div className="absolute top-2 right-2 z-10">
        <FileLockIndicator
          fileId={fileId}
          locks={fileLocks}
          participants={participants}
          currentUserId={userId}
        />
      </div>

      {/* Collision Detector */}
      <CollisionDetector
        socket={socket}
        editor={editor}
        currentFileId={fileId}
      />

      {/* Read-only overlay for hard locks */}
      {isReadOnly && (
        <div className="absolute inset-0 bg-black/5 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-red-200 rounded-lg p-4 shadow-lg pointer-events-auto">
            <p className="text-sm font-medium text-red-900">
              🔒 File locked by {lockedBy}
            </p>
            <p className="text-xs text-red-700 mt-1">
              This file is read-only while {lockedBy} is editing
            </p>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <Editor
        height="100%"
        language={language}
        value={contentRef.current}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          readOnly: isReadOnly,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          cursorBlinking: "smooth",
          smoothScrolling: true,
          // Highlight user's cursor color
          selectionHighlight: true,
        }}
        theme="vs-dark"
      />

      {/* Remote Cursors */}
      <MonacoRemoteCursors
        editor={editor}
        remoteCursors={remoteCursors}
        currentFileId={fileId}
      />
    </div>
  );
}