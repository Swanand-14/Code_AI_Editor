// components/CollisionDetector.tsx
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Socket } from "socket.io-client";
import * as monaco from "monaco-editor";

interface CollisionData {
  fileId: string;
  users: Array<{
    userId: string;
    userName: string;
    lineNumber: number;
  }>;
  yourLine: number;
}

interface CollisionDetectorProps {
  socket: Socket | null;
  editor: monaco.editor.IStandaloneCodeEditor | null;
  currentFileId: string;
}

export function CollisionDetector({
  socket,
  editor,
  currentFileId,
}: CollisionDetectorProps) {
  const [collision, setCollision] = useState<CollisionData | null>(null);
  const [decorationIds, setDecorationIds] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleCollision = (data: CollisionData) => {
      if (data.fileId !== currentFileId) return;
      
      setCollision(data);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        setCollision(null);
      }, 5000);
    };

    socket.on("collision:detected", handleCollision);

    return () => {
      socket.off("collision:detected", handleCollision);
    };
  }, [socket, currentFileId]);

  // Highlight collision zone in editor
  useEffect(() => {
    if (!editor || !collision) return;

    const minLine = Math.min(
      collision.yourLine,
      ...collision.users.map((u) => u.lineNumber)
    );
    const maxLine = Math.max(
      collision.yourLine,
      ...collision.users.map((u) => u.lineNumber)
    );

    const decoration: monaco.editor.IModelDeltaDecoration = {
      range: new monaco.Range(minLine, 1, maxLine, Number.MAX_VALUE),
      options: {
        isWholeLine: true,
        className: "collision-zone",
        glyphMarginClassName: "collision-glyph",
        zIndex: 500,
      },
    };

    const ids = editor.deltaDecorations(decorationIds, [decoration]);
    setDecorationIds(ids);

    // Add CSS
    const style = document.createElement("style");
    style.textContent = `
      .collision-zone {
        background-color: rgba(255, 193, 7, 0.15) !important;
        border-left: 3px solid #FFC107 !important;
      }
      
      .collision-glyph {
        background-color: #FFC107;
        width: 5px !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      if (editor) {
        editor.deltaDecorations(ids, []);
      }
    };
  }, [editor, collision]);

  if (!collision || collision.users.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 z-50 animate-in fade-in slide-in-from-right-5">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg max-w-xs">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">
              Edit Collision Detected
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {collision.users.length === 1 ? (
                <>
                  <strong>{collision.users[0].userName}</strong> is editing near
                  line {collision.users[0].lineNumber}
                </>
              ) : (
                <>
                  {collision.users.length} users are editing in this area
                </>
              )}
            </p>
            <p className="text-xs text-yellow-600 mt-2">
              Consider editing a different section to avoid conflicts
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to track typing and emit for collision detection
export function useCollisionTracking(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  fileId: string,
  emitTypingStart: (fileId: string, lineNumber: number) => void
) {
  useEffect(() => {
    if (!editor) return;

    let typingTimeout: NodeJS.Timeout;

    const handleContentChange = editor.onDidChangeModelContent(() => {
      const position = editor.getPosition();
      if (!position) return;

      // Clear previous timeout
      clearTimeout(typingTimeout);

      // Emit typing start
      emitTypingStart(fileId, position.lineNumber);

      // Stop emitting after 2 seconds of no typing
      typingTimeout = setTimeout(() => {
        // User stopped typing
      }, 2000);
    });

    return () => {
      handleContentChange.dispose();
      clearTimeout(typingTimeout);
    };
  }, [editor, fileId, emitTypingStart]);
}