
"use client";

import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { UserCursor } from "@/modules/collaboration/types"

interface MonacoRemoteCursorsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  remoteCursors: Map<string, UserCursor>;
  currentFileId: string;
}

export function MonacoRemoteCursors({
  editor,
  remoteCursors,
  currentFileId,
}: MonacoRemoteCursorsProps) {
  const decorationsRef = useRef<Map<string, string[]>>(new Map());
  const widgetsRef = useRef<Map<string, monaco.editor.IContentWidget>>(new Map());

  useEffect(() => {
    if (!editor) return;

    // Filter cursors for current file
    const fileCursors = Array.from(remoteCursors.values()).filter(
      (cursor) => cursor.fileId === currentFileId
    );

    // Clear old decorations and widgets
    decorationsRef.current.forEach((decorationIds) => {
      editor.deltaDecorations(decorationIds, []);
    });
    widgetsRef.current.forEach((widget) => {
      editor.removeContentWidget(widget);
    });
    decorationsRef.current.clear();
    widgetsRef.current.clear();

    // Add new decorations and widgets
    fileCursors.forEach((cursor) => {
      // 1. Cursor decoration (thin line at position)
      const cursorDecoration: monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(
          cursor.position.lineNumber,
          cursor.position.column,
          cursor.position.lineNumber,
          cursor.position.column
        ),
        options: {
          className: "remote-cursor",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          beforeContentClassName: "remote-cursor-line",
          zIndex: 1000,
        },
      };

      // 2. Selection decoration (if exists)
      const decorations: monaco.editor.IModelDeltaDecoration[] = [cursorDecoration];

      if (cursor.selection) {
        const selectionDecoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(
            cursor.selection.startLineNumber,
            cursor.selection.startColumn,
            cursor.selection.endLineNumber,
            cursor.selection.endColumn
          ),
          options: {
            className: "remote-selection",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            inlineClassName: `remote-selection-inline`,
            zIndex: 999,
          },
        };
        decorations.push(selectionDecoration);
      }

      // Apply decorations
      const decorationIds = editor.deltaDecorations([], decorations);
      decorationsRef.current.set(cursor.userId, decorationIds);

      // 3. Username label widget
      const widget: monaco.editor.IContentWidget = {
        getId: () => `remote-cursor-label-${cursor.userId}`,
        getDomNode: () => {
          const node = document.createElement("div");
          node.className = "remote-cursor-label";
          node.style.backgroundColor = cursor.userColor;
          node.style.color = "#fff";
          node.style.padding = "2px 6px";
          node.style.borderRadius = "3px";
          node.style.fontSize = "11px";
          node.style.fontWeight = "500";
          node.style.position = "absolute";
          node.style.zIndex = "1001";
          node.style.whiteSpace = "nowrap";
          node.style.pointerEvents = "none";
          node.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
          node.textContent = cursor.userName;
          return node;
        },
        getPosition: () => ({
          position: {
            lineNumber: cursor.position.lineNumber,
            column: cursor.position.column,
          },
          preference: [
            monaco.editor.ContentWidgetPositionPreference.ABOVE,
            monaco.editor.ContentWidgetPositionPreference.BELOW,
          ],
        }),
      };

      editor.addContentWidget(widget);
      widgetsRef.current.set(cursor.userId, widget);

      // Add CSS for cursor line
      const style = document.createElement("style");
      style.textContent = `
        .remote-cursor-line {
          border-left: 2px solid ${cursor.userColor} !important;
          height: 100%;
          position: absolute;
          animation: cursorBlink 1s infinite;
        }
        
        .remote-selection-inline {
          background-color: ${cursor.userColor}33 !important;
        }
        
        @keyframes cursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.3; }
        }
      `;
      document.head.appendChild(style);
    });

    // Cleanup
    return () => {
      decorationsRef.current.forEach((decorationIds) => {
        editor.deltaDecorations(decorationIds, []);
      });
      widgetsRef.current.forEach((widget) => {
        editor.removeContentWidget(widget);
      });
      decorationsRef.current.clear();
      widgetsRef.current.clear();
    };
  }, [editor, remoteCursors, currentFileId]);

  return null;
}

// Hook to track local cursor and emit
export function useMonacoCursorTracking(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  fileId: string,
  onCursorMove: (position: any, selection?: any) => void
) {
  useEffect(() => {
    if (!editor) return;

    const handleCursorChange = editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      const selection = editor.getSelection();

      const hasSelection = selection && !selection.isEmpty();

      onCursorMove(
        { lineNumber: position.lineNumber, column: position.column },
        hasSelection
          ? {
              startLineNumber: selection.startLineNumber,
              startColumn: selection.startColumn,
              endLineNumber: selection.endLineNumber,
              endColumn: selection.endColumn,
            }
          : undefined
      );
    });

    return () => {
      handleCursorChange.dispose();
    };
  }, [editor, fileId, onCursorMove]);
}