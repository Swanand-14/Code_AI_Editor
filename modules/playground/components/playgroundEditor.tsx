// "use client"
// import { useRef,useState,useCallback,useEffect } from 'react'
// import Editor,{type Monaco} from '@monaco-editor/react'
// import { configureMonaco,defaultEditorOptions,getEditorLanguage } from '../lib/editor-config'
// import type { TemplateFile } from '@/modules/playground/lib/path-to-json'

// import React from 'react'

// interface PlaygroundEditorProps {
//     activeFile: TemplateFile|undefined
//     content:string,
//     onContentChange:(value:string|undefined)=>void
//     suggestions:string|null
//     suggestionLoading:boolean
//     suggestionPosition:{line:number;column:number}|null
//     onAcceptSuggestion:(editor:any,monaco:any) =>void
//     onRejectSuggestion:(editor:any)=>void
//     onTriggerSuggestion:(type:string,editor:any)=>void
// }

// // CHANGE 1: Component name capitalized (React convention)
// const PlaygroundEditor = ({
//   activeFile,
//   content,
//   onContentChange,
//   // CHANGE 2: Added missing destructured props
//   suggestions,
//   suggestionLoading,
//   suggestionPosition,
//   onAcceptSuggestion,
//   onRejectSuggestion,
//   onTriggerSuggestion
// }:PlaygroundEditorProps) =>{
// const editorRef = useRef<any>(null);
// const monacoRef = useRef<Monaco|null>(null);
//  const inlineCompletionProviderRef = useRef<any>(null)
//   const currentSuggestionRef = useRef<{
//     text: string
//     position: { line: number; column: number }
//     id: string
//   } | null>(null)
//   const isAcceptingSuggestionRef = useRef(false)
//   const suggestionAcceptedRef = useRef(false)
//   const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
//   const tabCommandRef = useRef<any>(null)

// const generateSuggestionId = () =>`suggestion-${Date.now()}-${Math.random()}`
 
// const createInlineCompletionProvider = useCallback(
//     (monaco: Monaco) => {
//       return {
//         provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
//           console.log("provideInlineCompletions called", {
//             // CHANGE 3: Fixed variable name from 'suggestion' to 'suggestions'
//             hasSuggestion: !!suggestions,
//             hasPosition: !!suggestionPosition,
//             currentPos: `${position.lineNumber}:${position.column}`,
//             suggestionPos: suggestionPosition ? `${suggestionPosition.line}:${suggestionPosition.column}` : null,
//             isAccepting: isAcceptingSuggestionRef.current,
//             suggestionAccepted: suggestionAcceptedRef.current,
//           })

//           // Don't provide completions if we're currently accepting or have already accepted
//           if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
//             console.log("Skipping completion - already accepting or accepted")
//             return { items: [] }
//           }

//           // Only provide suggestion if we have one
//           // CHANGE 4: Fixed variable name from 'suggestion' to 'suggestions'
//           if (!suggestions || !suggestionPosition) {
//             console.log("No suggestion or position available")
//             return { items: [] }
//           }

//           // Check if current position matches suggestion position (with some tolerance)
//           const currentLine = position.lineNumber
//           const currentColumn = position.column

//           const isPositionMatch =
//             currentLine === suggestionPosition.line &&
//             currentColumn >= suggestionPosition.column &&
//             currentColumn <= suggestionPosition.column + 2 // Small tolerance

//           if (!isPositionMatch) {
//             console.log("Position mismatch", {
//               current: `${currentLine}:${currentColumn}`,
//               expected: `${suggestionPosition.line}:${suggestionPosition.column}`,
//             })
//             return { items: [] }
//           }

//           const suggestionId = generateSuggestionId()
//           currentSuggestionRef.current = {
//             // CHANGE 5: Fixed variable name from 'suggestion' to 'suggestions'
//             text: suggestions,
//             position: suggestionPosition,
//             id: suggestionId,
//           }

//           // CHANGE 6: Fixed variable name from 'suggestion' to 'suggestions'
//           console.log("Providing inline completion", { suggestionId, suggestion: suggestions.substring(0, 50) + "..." })

//           // Clean the suggestion text (remove \r characters)
//           // CHANGE 7: Fixed variable name from 'suggestion' to 'suggestions'
//           const cleanSuggestion = suggestions.replace(/\r/g, "")

//           return {
//             items: [
//               {
//                 insertText: cleanSuggestion,
//                 range: new monaco.Range(
//                   suggestionPosition.line,
//                   suggestionPosition.column,
//                   suggestionPosition.line,
//                   suggestionPosition.column,
//                 ),
//                 kind: monaco.languages.CompletionItemKind.Snippet,
//                 label: "AI Suggestion",
//                 detail: "AI-generated code suggestion",
//                 documentation: "Press Tab to accept",
//                 sortText: "0000", // High priority
//                 filterText: "",
//                 insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
//               },
//             ],
//           }
//         },
//         freeInlineCompletions: (completions: any) => {
//           console.log("freeInlineCompletions called")
//         },
//       }
//     },
//     // CHANGE 8: Fixed dependency from 'suggestion' to 'suggestions'
//     [suggestions, suggestionPosition],
//   )

// const clearCurrentSuggestion = useCallback(()=>{
// currentSuggestionRef.current = null
// suggestionAcceptedRef.current = false
// if(editorRef.current){
//   editorRef.current.trigger("ai","editor.action.inlineSuggest.hide",null)
// }
// },[])

//  const acceptCurrentSuggestion = useCallback(() => {
//     console.log("acceptCurrentSuggestion called", {
//       hasEditor: !!editorRef.current,
//       hasMonaco: !!monacoRef.current,
//       hasSuggestion: !!currentSuggestionRef.current,
//       isAccepting: isAcceptingSuggestionRef.current,
//       suggestionAccepted: suggestionAcceptedRef.current,
//     })

//     if (!editorRef.current || !monacoRef.current || !currentSuggestionRef.current) {
//       console.log("Cannot accept suggestion - missing refs")
//       return false
//     }

    
//     if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
//       console.log("BLOCKED: Already accepting/accepted suggestion, skipping")
//       return false
//     }

   
//     isAcceptingSuggestionRef.current = true
//     suggestionAcceptedRef.current = true

//     const editor = editorRef.current
//     const monaco = monacoRef.current
//     const currentSuggestion = currentSuggestionRef.current

//     try {
//       // Clean the suggestion text (remove \r characters)
//       const cleanSuggestionText = currentSuggestion.text.replace(/\r/g, "")

//       console.log("ACCEPTING suggestion:", cleanSuggestionText.substring(0, 50) + "...")

//       // Get current cursor position to validate
//       const currentPosition = editor.getPosition()
//       const suggestionPos = currentSuggestion.position

//       // Verify we're still at the suggestion position
//       if (
//         currentPosition.lineNumber !== suggestionPos.line ||
//         currentPosition.column < suggestionPos.column ||
//         currentPosition.column > suggestionPos.column + 5
//       ) {
//         console.log("Position changed, cannot accept suggestion")
//         return false
//       }

//       // Insert the suggestion text at the correct position
//       const range = new monaco.Range(suggestionPos.line, suggestionPos.column, suggestionPos.line, suggestionPos.column)

//       // Use executeEdits to insert the text
//       const success = editor.executeEdits("ai-suggestion-accept", [
//         {
//           range: range,
//           text: cleanSuggestionText,
//           forceMoveMarkers: true,
//         },
//       ])

//       if (!success) {
//         console.error("Failed to execute edit")
//         return false
//       }

//       // Calculate new cursor position
//       const lines = cleanSuggestionText.split("\n")
//       const endLine = suggestionPos.line + lines.length - 1
//       const endColumn =
//         lines.length === 1 ? suggestionPos.column + cleanSuggestionText.length : lines[lines.length - 1].length + 1

//       // Move cursor to end of inserted text
//       editor.setPosition({ lineNumber: endLine, column: endColumn })

//       console.log("SUCCESS: Suggestion accepted, new position:", `${endLine}:${endColumn}`)

//       // Clear the suggestion
//       clearCurrentSuggestion()

     
//       onAcceptSuggestion(editor, monaco)

//       return true
//     } catch (error) {
//       console.error("Error accepting suggestion:", error)
//       return false
//     } finally {
//       // Reset accepting flag immediately
//       isAcceptingSuggestionRef.current = false

//       // Keep accepted flag for longer to prevent immediate re-acceptance
//       setTimeout(() => {
//         suggestionAcceptedRef.current = false
//         console.log("Reset suggestionAcceptedRef flag")
//       }, 1000) // Increased delay to 1 second
//     }
//   }, [clearCurrentSuggestion, onAcceptSuggestion])

//  useEffect(() => {
//     if (!editorRef.current || !monacoRef.current) return

//     const editor = editorRef.current
//     const monaco = monacoRef.current

//     console.log("Suggestion changed", {
//       // CHANGE 9: Fixed variable name from 'suggestion' to 'suggestions'
//       hasSuggestion: !!suggestions,
//       hasPosition: !!suggestionPosition,
//       isAccepting: isAcceptingSuggestionRef.current,
//       suggestionAccepted: suggestionAcceptedRef.current,
//     })

//     // Don't update if we're in the middle of accepting a suggestion
//     if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
//       console.log("Skipping update - currently accepting/accepted suggestion")
//       return
//     }

//     // Dispose previous provider
//     if (inlineCompletionProviderRef.current) {
//       inlineCompletionProviderRef.current.dispose()
//       inlineCompletionProviderRef.current = null
//     }

//     // Clear current suggestion reference
//     currentSuggestionRef.current = null

//     // Register new provider if we have a suggestion
//     // CHANGE 10: Fixed variable name from 'suggestion' to 'suggestions'
//     if (suggestions && suggestionPosition) {
//       console.log("Registering new inline completion provider")

//       const language = getEditorLanguage(activeFile?.fileExtension || "")
//       const provider = createInlineCompletionProvider(monaco)

//       inlineCompletionProviderRef.current = monaco.languages.registerInlineCompletionsProvider(language, provider)

      
//       setTimeout(() => {
//         if (editorRef.current && !isAcceptingSuggestionRef.current && !suggestionAcceptedRef.current) {
//           console.log("Triggering inline suggestions")
//           editor.trigger("ai", "editor.action.inlineSuggest.trigger", null)
//         }
//       }, 50)
//     }

//     return () => {
//       if (inlineCompletionProviderRef.current) {
//         inlineCompletionProviderRef.current.dispose()
//         inlineCompletionProviderRef.current = null
//       }
//     }
//     // CHANGE 11: Fixed dependency from 'suggestion' to 'suggestions'
//   }, [suggestions, suggestionPosition, activeFile, createInlineCompletionProvider])

// const hasActiveSuggestionAtPosition = useCallback(() => {
//     if (!editorRef.current || !currentSuggestionRef.current) return false

//     const position = editorRef.current.getPosition()
//     const suggestion = currentSuggestionRef.current

//     return (
//       position.lineNumber === suggestion.position.line &&
//       position.column >= suggestion.position.column &&
//       position.column <= suggestion.position.column + 2
//     )
//   }, [])
// const handleEditorDidMount = (editor:any,monaco:Monaco)=>{
//     editorRef.current = editor
//     monacoRef.current = monaco
//     console.log("Editor instance mounted:",!!editorRef.current)
//     editor.updateOptions({
//         ...defaultEditorOptions,
//         inlineSuggest: {
//         enabled: true,
//         mode: "prefix",
//         suppressSuggestions: false,
//       },
     
//       suggest: {
//         preview: false, 
//         showInlineDetails: false,
//         insertMode: "replace",
//       },
      
//       quickSuggestions: {
//         other: true,
//         comments: false,
//         strings: false,
//       },
     
//       cursorSmoothCaretAnimation: "on",

//     })
//     configureMonaco(monaco)
//     editor.addCommand(monaco.KeyMod.CtrlCmd| monaco.KeyCode.Space,()=>{
//       console.log("Ctrl+Space pressed, triggering suggestions")
//       onTriggerSuggestion("completion",editor)
//     })
//     if(tabCommandRef.current){
//       tabCommandRef.current.dispose()
//     }
//     tabCommandRef.current = editor.addCommand(
//       monaco.KeyCode.Tab,
//       () => {
//         console.log("TAB PRESSED", {
//           hasSuggestion: !!currentSuggestionRef.current,
//           hasActiveSuggestion: hasActiveSuggestionAtPosition(),
//           isAccepting: isAcceptingSuggestionRef.current,
//           suggestionAccepted: suggestionAcceptedRef.current,
//         })

//         // CRITICAL: Block if already processing
//         if (isAcceptingSuggestionRef.current) {
//           console.log("BLOCKED: Already in the process of accepting, ignoring Tab")
//           return
//         }

//         // CRITICAL: Block if just accepted
//         if (suggestionAcceptedRef.current) {
//           console.log("BLOCKED: Suggestion was just accepted, using default tab")
//           editor.trigger("keyboard", "tab", null)
//           return
//         }

//         // If we have an active suggestion at the current position, try to accept it
//         if (currentSuggestionRef.current && hasActiveSuggestionAtPosition()) {
//           console.log("ATTEMPTING to accept suggestion with Tab")
//           const accepted = acceptCurrentSuggestion()
//           if (accepted) {
//             console.log("SUCCESS: Suggestion accepted via Tab, preventing default behavior")
//             return // CRITICAL: Return here to prevent default tab behavior
//           }
//           console.log("FAILED: Suggestion acceptance failed, falling through to default")
//         }

//         // Default tab behavior (indentation)
//         console.log("DEFAULT: Using default tab behavior")
//         editor.trigger("keyboard", "tab", null)
//       },
//       // CRITICAL: Use specific context to override Monaco's built-in Tab handling
//       "editorTextFocus && !editorReadonly && !suggestWidgetVisible",
//     )

//     // Escape to reject
//     editor.addCommand(monaco.KeyCode.Escape, () => {
//       console.log("Escape pressed")
//       if (currentSuggestionRef.current) {
//         onRejectSuggestion(editor)
//         clearCurrentSuggestion()
//       }
//     })

//     // Listen for cursor position changes to hide suggestions when moving away
//     editor.onDidChangeCursorPosition((e: any) => {
//       if (isAcceptingSuggestionRef.current) return

//       const newPosition = e.position

//       // Clear existing suggestion if cursor moved away
//       if (currentSuggestionRef.current && !suggestionAcceptedRef.current) {
//         const suggestionPos = currentSuggestionRef.current.position

//         // If cursor moved away from suggestion position, clear it
//         if (
//           newPosition.lineNumber !== suggestionPos.line ||
//           newPosition.column < suggestionPos.column ||
//           newPosition.column > suggestionPos.column + 10
//         ) {
//           console.log("Cursor moved away from suggestion, clearing")
//           clearCurrentSuggestion()
//           onRejectSuggestion(editor)
//         }
//       }

//       // Trigger new suggestion if appropriate (simplified)
//       if (!currentSuggestionRef.current && !suggestionLoading) {
//         // Clear any existing timeout
//         if (suggestionTimeoutRef.current) {
//           clearTimeout(suggestionTimeoutRef.current)
//         }

//         // Trigger suggestion with a delay
//         suggestionTimeoutRef.current = setTimeout(() => {
//           onTriggerSuggestion("completion", editor)
//         }, 300)
//       }
//     })

//     // Listen for content changes to detect manual typing over suggestions
//     editor.onDidChangeModelContent((e: any) => {
//       if (isAcceptingSuggestionRef.current) return

//       // If user types while there's a suggestion, clear it (unless it's our insertion)
//       if (currentSuggestionRef.current && e.changes.length > 0 && !suggestionAcceptedRef.current) {
//         const change = e.changes[0]

//         // Check if this is our own suggestion insertion
//         if (
//           change.text === currentSuggestionRef.current.text ||
//           change.text === currentSuggestionRef.current.text.replace(/\r/g, "")
//         ) {
//           console.log("Our suggestion was inserted, not clearing")
//           return
//         }

//         // User typed something else, clear the suggestion
//         console.log("User typed while suggestion active, clearing")
//         clearCurrentSuggestion()
//       }

//       // Trigger context-aware suggestions on certain typing patterns
//       if (e.changes.length > 0 && !suggestionAcceptedRef.current) {
//         const change = e.changes[0]

//         // Trigger suggestions after specific characters
//         if (
//           change.text === "\n" || // New line
//           change.text === "{" || // Opening brace
//           change.text === "." || // Dot notation
//           change.text === "=" || // Assignment
//           change.text === "(" || // Function call
//           change.text === "," || // Parameter separator
//           change.text === ":" || // Object property
//           change.text === ";" // Statement end
//         ) {
//           setTimeout(() => {
//             if (editorRef.current && !currentSuggestionRef.current && !suggestionLoading) {
//               onTriggerSuggestion("completion", editor)
//             }
//           }, 100) // Small delay to let the change settle
//         }
//       }
//     })

//     updateEditorLanguage()
// }
// const updateEditorLanguage = () => {
//     if (!activeFile || !monacoRef.current || !editorRef.current) return
//     const model = editorRef.current.getModel()
//     if (!model) return

//     const language = getEditorLanguage(activeFile.fileExtension || "")
//     try {
//       monacoRef.current.editor.setModelLanguage(model, language)
//     } catch (error) {
//       console.warn("Failed to set editor language:", error)
//     }
//   }

// useEffect(() => {
//     return () => {
//       if (suggestionTimeoutRef.current) {
//         clearTimeout(suggestionTimeoutRef.current)
//       }
//       if (inlineCompletionProviderRef.current) {
//         inlineCompletionProviderRef.current.dispose()
//         inlineCompletionProviderRef.current = null
//       }
//       if (tabCommandRef.current) {
//         tabCommandRef.current.dispose()
//         tabCommandRef.current = null
//       }
//     }
//   }, [])

// useEffect(()=>{
//     updateEditorLanguage()
// },[activeFile?.fileExtension])

//   return (
//     <div className='h-full w-full relative'>
//         <Editor height={"100%"}
//         width={"100%"}
//         value={content}
//         onChange={(value)=>onContentChange(value||"")}
//         onMount={handleEditorDidMount}
//         language={activeFile?getEditorLanguage(activeFile.fileExtension||"") :"plaintext"}
        
//         options={defaultEditorOptions}
//         />
//     </div>
//   )
// }

//  CHANGE 12: Export with capitalized name
// export default PlaygroundEditor

//modules/playground/components/playgroundEditor.tsx

"use client";

import { useRef, useEffect, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages } from "monaco-editor";
import type { TemplateFile } from '@/modules/playground/lib/path-to-json';

interface PlaygroundEditorProps {
  activeFile: TemplateFile | undefined;
  content: string;
  onContentChange: (value: string) => void;
  suggestionLoading?: boolean;
}

export default function PlaygroundEditor({
  activeFile,
  content,
  onContentChange,
  suggestionLoading = false,
}: PlaygroundEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const providerRef = useRef<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getLanguage = (file: TemplateFile | undefined): string => {
    if (!file) return "javascript";
    
    const extensionMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      json: "json",
      html: "html",
      css: "css",
      scss: "scss",
      py: "python",
      java: "java",
      cpp: "cpp",
      c: "c",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      md: "markdown",
      sql: "sql",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
    };

    return extensionMap[file.fileExtension] || "javascript";
  };

  const fetchCompletion = useCallback(async (
    textBeforeCursor: string,
    textAfterCursor: string,
    language: string
  ): Promise<string> => {
    try {
      console.log('📡 Fetching completion...');
      
      const response = await fetch("/api/copilot-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textBeforeCursor,
          textAfterCursor,
          language,
          fileName: activeFile?.filename || 'untitled',
          fileExtension: activeFile?.fileExtension || 'txt',
        }),
      });

      if (!response.ok) {
        console.error('❌ API error:', response.status);
        return "";
      }

      const data = await response.json();
      console.log('✅ Received completion:', data.completion?.slice(0, 100));
      return data.completion || "";
    } catch (error) {
      console.error("❌ Completion error:", error);
      return "";
    }
  }, [activeFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    console.log('🚀 Editor mounted');

    // Configure editor
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      lineHeight: 22,
      minimap: { enabled: true },
      lineNumbers: "on",
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "on",
      
      // Inline suggestions
      inlineSuggest: { enabled: true },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
    });

    // Register inline completion provider
    setupInlineCompletionProvider(editor, monaco);

    // Setup keybindings
    setupKeybindings(editor, monaco);

    // Add custom styles
    injectCustomStyles();
  };

  const setupInlineCompletionProvider = (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor")
  ) => {
    const language = getLanguage(activeFile);
    console.log('🔧 Setting up inline completion provider for:', language);

    // Dispose previous provider
    if (providerRef.current) {
      providerRef.current.dispose();
    }

    // Register inline completions provider
    providerRef.current = monaco.languages.registerInlineCompletionsProvider(language, {
      provideInlineCompletions: async (model, position, context, token) => {
        // Clear any existing debounce timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        return new Promise((resolve) => {
          debounceTimerRef.current = setTimeout(async () => {
            try {
              const currentLine = model.getLineContent(position.lineNumber);
              const textBeforeCursorInLine = currentLine.substring(0, position.column - 1);
              
              // Only trigger if we have meaningful content (at least 3 chars)
              if (textBeforeCursorInLine.trim().length < 3) {
                resolve({ items: [] });
                return;
              }

              console.log('🎯 Providing inline completion at:', position);

              const textBeforeCursor = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              });

              const textAfterCursor = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: model.getLineCount(),
                endColumn: model.getLineMaxColumn(model.getLineCount()),
              });

              const completion = await fetchCompletion(
                textBeforeCursor,
                textAfterCursor,
                language
              );

              if (!completion || token.isCancellationRequested || completion.length < 3) {
                resolve({ items: [] });
                return;
              }

              resolve({
                items: [
                  {
                    insertText: completion,
                    range: new monaco.Range(
                      position.lineNumber,
                      position.column,
                      position.lineNumber,
                      position.column
                    ),
                    command: {
                      id: 'copilot.accept',
                      title: 'Accept',
                    },
                  },
                ],
              });
            } catch (error) {
              console.error('❌ Error in provideInlineCompletions:', error);
              resolve({ items: [] });
            }
          }, 800); // Increased to 800ms to reduce API calls
        });
      },
      
      freeInlineCompletions: () => {
        // Cleanup if needed
      },
    });

    console.log('✅ Inline completion provider registered');
  };

  const setupKeybindings = (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor")
  ) => {
    // Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const event = new CustomEvent("editor-save");
      window.dispatchEvent(event);
    });

    // Ctrl+/ for line comment
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.trigger("keyboard", "editor.action.commentLine", {});
    });

    // Ctrl+Shift+F for format
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => {
        editor.trigger("keyboard", "editor.action.formatDocument", {});
      }
    );
  };

  const injectCustomStyles = () => {
    if (document.getElementById("playground-editor-styles")) return;

    const style = document.createElement("style");
    style.id = "playground-editor-styles";
    style.innerHTML = `
      /* Inline completion ghost text */
      .monaco-editor .inline-completion-text-to-replace {
        opacity: 0.4 !important;
        font-style: italic !important;
      }

      .monaco-editor .ghost-text {
        opacity: 0.4 !important;
        font-style: italic !important;
        color: #888 !important;
      }

      /* Custom scrollbar */
      .monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
        background: rgba(100, 100, 100, 0.4) !important;
      }

      .monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover {
        background: rgba(100, 100, 100, 0.7) !important;
      }

      /* Current line */
      .monaco-editor .current-line {
        background-color: rgba(255, 255, 255, 0.03) !important;
      }

      /* Selection */
      .monaco-editor .selected-text {
        background-color: rgba(58, 130, 246, 0.3) !important;
      }

      /* Bracket matching */
      .monaco-editor .bracket-match {
        background-color: rgba(34, 197, 94, 0.2) !important;
        border: 1px solid rgba(34, 197, 94, 0.5) !important;
      }
    `;
    document.head.appendChild(style);
  };

  // Re-register provider when language changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current && activeFile) {
      // Only re-register if file extension actually changed
      const currentLanguage = getLanguage(activeFile);
      console.log('📝 File changed to:', activeFile.filename, 'Language:', currentLanguage);
      setupInlineCompletionProvider(editorRef.current, monacoRef.current);
    }
  }, [activeFile?.fileExtension]); // Removed fetchCompletion dependency

  // Cleanup
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.dispose();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onContentChange(value);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No file selected</p>
          <p className="text-xs mt-2">Select a file from the explorer to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {suggestionLoading && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">AI thinking...</span>
        </div>
      )}

      <Editor
        height="100%"
        language={getLanguage(activeFile)}
        value={content}
        theme="vs-dark"
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{ readOnly: false }}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      />

      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded border">
        Tab: Accept • Esc: Reject
      </div>
    </div>
  );
}