import { useState,useCallback } from "react";
import { set } from "zod";
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
    acceptSuggestion:(editor:any)=>void;
    rejectSuggestion:()=>void;
    clearSuggestions:()=>void;

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
const fetchSuggestion = useCallback(async(type:string,editor:any)=>{
    setstate((currentState)=>{
        if(!currentState.isEnabled){
            return currentState;

        }
        if(!editor){
            return currentState;
        }
        const model = editor.getModel();
        const cursorPosition = editor.getPosition();
        if(!model||!cursorPosition){
            return currentState;
        }
        const newState = {...currentState,isLoading:true}

        (async()=>{
            try {
                const payload = {
                    fileContent.model.getValue(),
                    cursorLine:cursorPosition.lineNumber-1,
                    cursorColumn:cursorPosition.column-1,
                    suggestionType:type
                }
                const response = await fetch("/api/code-suggestions",{
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
                    console.warn("No suggestion recieved from API");
                    setstate((prev)=>({...prev,isLoading:false}));

                }
            } catch (error) {
                
            }
        })()

    })

},[])
const acceptSuggestion = useCallback(()=>{
(editor:any,monaco:any)=>{
    setstate((currentState)=>{
        if(!currentState.suggestions||!currentState.position||!editor||!monaco){
            return currentState;
        }
        const {line,column} = currentState.position;
        const sanitizedSuggestion = currentState.suggestions.replace(/^\d+:\s*/gm,"")
        editor.executeEdits("",[{
            range:new monaco.Range(line,column,line,column)
            text:sanitizedSuggestion,
            forceMoveMarkers:true,
        }]);
        if(editor&&currentState.decoration.length>0){
            editor.deltaDecorations(currentState.decoration,[])
        }
        return {
            ...currentState,
            suggestion:null,
            position:null,
            decoration:[]
        }
        
    })
}
},[])

const rejectSuggestion = useCallback((editor:any)=>{
    setstate((currentState)=>{
        if(editor&&currentState.decoration.length>0){
            editor.deltaDecorations(currentState.decoration,[])
        }
        return {
            ...currentState,
            suggestion:null,
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
        return {
            ...currentState,
            suggestion:null,
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