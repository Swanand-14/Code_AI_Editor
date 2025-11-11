import { useState,useCallback } from "react";

interface AISuggestionsState {
    suggestions:string|null;
    isLoading:boolean;
    position:{line:number;column:number}|null;
    decoration:string[];
    isEnabled:boolean;
}

interface UseAiSuggestionsReturn extends AISuggestionsState{
    toggleEnabled:()=>void;
    fetchSuggestion:(type:string,editor:any)=>Promise<void>;
    acceptSuggestion:(editor:any,monaco:any)=>void;
    rejectSuggestion:(editor:any)=>void;
    clearSuggestions:(editor:any)=>void;
}

export const UseAiSuggestions = ():UseAiSuggestionsReturn=>{
    const [state,setstate] = useState<AISuggestionsState>({
        suggestions:null,
        isLoading:false,
        position:null,
        decoration:[],
        isEnabled:true,
    })

    const toggleEnabled = useCallback(()=>{
        setstate((prev)=>({...prev,isEnabled:!prev.isEnabled}))
    },[])

    // CHANGE 1: Fixed fetchSuggestion - removed nested setState pattern
    const fetchSuggestion = useCallback(async(type:string,editor:any)=>{
        // Early returns
        if(!state.isEnabled || !editor){
            return;
        }

        const model = editor.getModel();
        const cursorPosition = editor.getPosition();
        if(!model || !cursorPosition){
            return;
        }

        // Set loading state
        setstate((prev) => ({...prev, isLoading: true}));

        try {
            const payload = {
                fileContent:model.getValue(),
                cursorLine:cursorPosition.lineNumber-1,
                cursorColumn:cursorPosition.column-1,
                suggestionType:type
            }
            
            const response = await fetch("/api/code-completion",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify(payload)
            })
            
            if(!response.ok){
                throw new Error(`API responded with status ${response.status}`);
            }
            
            const data = await response.json()
            
            if(data.suggestion){
                const suggestionText = data.suggestion.trim();
                setstate((prev)=>({
                    ...prev,
                    suggestions:suggestionText,
                    position:{
                        line:cursorPosition.lineNumber,
                        column:cursorPosition.column
                    },
                    isLoading:false
                }))
            }else{
                console.warn("No suggestion received from API");
                setstate((prev)=>({...prev,isLoading:false}));
            }
        } catch (error) {
            console.error("Error fetching suggestion:", error);
            setstate((prev)=>({...prev,isLoading:false}));
        }
    },[state.isEnabled]) // Added dependency

    // CHANGE 2: Fixed acceptSuggestion - removed extra arrow function wrapper
    const acceptSuggestion = useCallback((editor:any,monaco:any)=>{
        setstate((currentState)=>{
            if(!currentState.suggestions||!currentState.position||!editor||!monaco){
                return currentState;
            }
            
            const {line,column} = currentState.position;
            const sanitizedSuggestion = currentState.suggestions.replace(/^\d+:\s*/gm,"")
            
            editor.executeEdits("",[{
                range:new monaco.Range(line,column,line,column),
                text:sanitizedSuggestion,
                forceMoveMarkers:true,
            }]);
            
            if(editor&&currentState.decoration.length>0){
                editor.deltaDecorations(currentState.decoration,[])
            }
            
            // CHANGE 3: Fixed typo - 'suggestion' should be 'suggestions'
            return {
                ...currentState,
                suggestions:null,
                position:null,
                decoration:[]
            }
        })
    },[])

    const rejectSuggestion = useCallback((editor:any)=>{
        setstate((currentState)=>{
            if(editor&&currentState.decoration.length>0){
                editor.deltaDecorations(currentState.decoration,[])
            }
            // CHANGE 4: Fixed typo - 'suggestion' should be 'suggestions'
            return {
                ...currentState,
                suggestions:null,
                position:null,
                decoration:[]
            }
        })
    },[])

    const clearSuggestions = useCallback((editor:any)=>{
        setstate((currentState)=>{
            if(editor&&currentState.decoration.length>0){
                editor.deltaDecorations(currentState.decoration,[])
            }
            // CHANGE 5: Fixed typo - 'suggestion' should be 'suggestions'
            return {
                ...currentState,
                suggestions:null,
                position:null,
                decoration:[]
            }
        })
    },[])

    return {
        ...state,
        toggleEnabled,
        acceptSuggestion,
        fetchSuggestion,
        rejectSuggestion,
        clearSuggestions
    }
}

// import { useState, useCallback, useRef } from "react";

// interface AISuggestionsState {
//   suggestions: string | null;
//   isLoading: boolean;
//   position: { line: number; column: number } | null;
//   decoration: string[];
//   isEnabled: boolean;
// }

// interface UseAiSuggestionsReturn extends AISuggestionsState {
//   toggleEnabled: () => void;
//   setIsLoading: (loading: boolean) => void;
// }

// export const UseAiSuggestions = (): UseAiSuggestionsReturn => {
//   const [state, setState] = useState<AISuggestionsState>({
//     suggestions: null,
//     isLoading: false,
//     position: null,
//     decoration: [],
//     isEnabled: true,
//   });

//   const toggleEnabled = useCallback(() => {
//     setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
//   }, []);

//   const setIsLoading = useCallback((loading: boolean) => {
//     setState((prev) => ({ ...prev, isLoading: loading }));
//   }, []);

//   return {
//     ...state,
//     toggleEnabled,
//     setIsLoading,
//   };
// };