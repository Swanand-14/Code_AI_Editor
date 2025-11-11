

import { type NextRequest,NextResponse } from "next/server";

interface CodeSuggestionRequest{
    fileContent:string;
    cursorLine:number;
    cursorColumn:number;
    suggestionType:string;
    fileName?:string
}

interface CodeContext {
    language:string;
    framework:string;
    beforeContext:string;
    currentLine:string;
    afterContext:string;
    cursorPosition:{line:number;column:number};
    isInFunction:boolean;
    isInClass:boolean;
    isAfterComment:boolean;
    incompletePatterns:string[]
}

export async function POST(req:NextRequest){
    try {
        const body:CodeSuggestionRequest = await req.json();
        const {fileContent,cursorLine,cursorColumn,suggestionType,fileName} = body
        if(!fileContent||cursorLine<0||cursorColumn<0||!suggestionType){
            return NextResponse.json({error:"Invalid input parameters"},{status:400})
        }
        const context = analyzeCodeContext(fileContent,cursorLine,cursorColumn,fileName)
        const prompt = buildPrompt(context,suggestionType)
        const suggestion = await generateSuggestion(prompt)
        return NextResponse.json({
            suggestion,
            context,
            metadata:{
                language:context.language,
                framework:context.framework,
                position:context.cursorPosition,
                generatedAt:new Date().toISOString(),
            },
        })
    } catch (error:any) {
        console.error("Context analysis error:",error)
        return NextResponse.json({error:"Internal server error",message:error.message},{
          status:500
        })
    }
}

function analyzeCodeContext(content: string, line: number, column: number, fileName?: string): CodeContext {
  const lines = content.split("\n")
  const currentLine = lines[line] || ""

  // Get surrounding context (10 lines before and after)
  const contextRadius = 10
  const startLine = Math.max(0, line - contextRadius)
  const endLine = Math.min(lines.length, line + contextRadius)

  const beforeContext = lines.slice(startLine, line).join("\n")
  const afterContext = lines.slice(line + 1, endLine).join("\n")

  // Detect language and framework
  const language = detectLanguage(content, fileName)
  const framework = detectFramework(content)

  // Analyze code patterns
  const isInFunction = detectInFunction(lines, line)
  const isInClass = detectInClass(lines, line)
  const isAfterComment = detectAfterComment(currentLine, column)
  const incompletePatterns = detectIncompletePatterns(currentLine, column)

  return {
    language,
    framework,
    beforeContext,
    currentLine,
    afterContext,
    cursorPosition: { line, column },
    isInFunction,
    isInClass,
    isAfterComment,
    incompletePatterns,
  }
}

function detectLanguage(content: string, fileName?: string): string {
  // Check file extension first
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const extensionMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
    }
    if (ext && extensionMap[ext]) {
      return extensionMap[ext]
    }
  }

  // Fallback to content analysis
  if (/import\s+.*\s+from|export\s+(default|const|function)/.test(content)) {
    return content.includes('tsx') || content.includes(': React') ? 'typescript' : 'javascript'
  }
  if (/def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import/.test(content)) {
    return 'python'
  }
  if (/public\s+class|private\s+static|void\s+main/.test(content)) {
    return 'java'
  }
  
  return 'javascript' // default
}

function detectFramework(content: string): string {
  if (/from\s+['"]react['"]|import\s+React/.test(content)) {
    return 'React'
  }
  if (/@Component|@NgModule|import.*@angular/.test(content)) {
    return 'Angular'
  }
  if (/from\s+['"]vue['"]|Vue\.component/.test(content)) {
    return 'Vue'
  }
  if (/from\s+['"]next|import.*next/.test(content)) {
    return 'Next.js'
  }
  if (/express\(\)|app\.get\(|app\.post\(/.test(content)) {
    return 'Express'
  }
  if (/FastAPI|from\s+fastapi/.test(content)) {
    return 'FastAPI'
  }
  if (/class.*extends\s+Component|Django/.test(content)) {
    return 'Django'
  }
  
  return 'None'
}

function detectInFunction(lines: string[], currentLine: number): boolean {
  let braceCount = 0
  let foundFunction = false

  // Look backwards from current line
  for (let i = currentLine; i >= 0; i--) {
    const line = lines[i].trim()
    
    // Count braces
    braceCount += (line.match(/\{/g) || []).length
    braceCount -= (line.match(/\}/g) || []).length
    
    // Check for function declaration
    if (/function\s+\w+|const\s+\w+\s*=\s*\(|=>\s*\{|def\s+\w+/.test(line)) {
      foundFunction = true
    }
    
    // If we're back to balanced braces and found a function, we're in it
    if (braceCount <= 0 && foundFunction) {
      return true
    }
    
    // If braces go negative, we've left the scope
    if (braceCount < 0) {
      return false
    }
  }
  
  return false
}

function detectInClass(lines: string[], currentLine: number): boolean {
  let braceCount = 0
  let foundClass = false

  // Look backwards from current line
  for (let i = currentLine; i >= 0; i--) {
    const line = lines[i].trim()
    
    // Count braces
    braceCount += (line.match(/\{/g) || []).length
    braceCount -= (line.match(/\}/g) || []).length
    
    // Check for class declaration
    if (/class\s+\w+|interface\s+\w+/.test(line)) {
      foundClass = true
    }
    
    // If we're back to balanced braces and found a class, we're in it
    if (braceCount <= 0 && foundClass) {
      return true
    }
    
    // If braces go negative, we've left the scope
    if (braceCount < 0) {
      return false
    }
  }
  
  return false
}

function detectAfterComment(line: string, column: number): boolean {
  const beforeCursor = line.substring(0, column).trim()
  return /\/\/|\/\*|\*\/|#/.test(beforeCursor)
}

function detectIncompletePatterns(line: string, column: number): string[] {
  const beforeCursor = line.substring(0, column)
  const patterns: string[] = []

  if (/^\s*(if|while|for)\s*\($/.test(beforeCursor.trim())) patterns.push("conditional")
  if (/^\s*(function|def)\s*$/.test(beforeCursor.trim())) patterns.push("function")
  if (/\{\s*$/.test(beforeCursor)) patterns.push("object")
  if (/\[\s*$/.test(beforeCursor)) patterns.push("array")
  if (/=\s*$/.test(beforeCursor)) patterns.push("assignment")
  if (/\.\s*$/.test(beforeCursor)) patterns.push("method-call")

  return patterns
}

function buildPrompt(context: CodeContext, suggestionType: string): string {
  return `You are an expert code completion assistant. Generate a ${suggestionType} suggestion.

Language: ${context.language}
Framework: ${context.framework}

Context:
${context.beforeContext}
${context.currentLine.substring(0, context.cursorPosition.column)}|CURSOR|${context.currentLine.substring(context.cursorPosition.column)}
${context.afterContext}

Analysis:
- In Function: ${context.isInFunction}
- In Class: ${context.isInClass}
- After Comment: ${context.isAfterComment}
- Incomplete Patterns: ${context.incompletePatterns.join(", ") || "None"}

Instructions:
1. Provide ONLY the code that should be inserted at the cursor position
2. Do NOT include any explanations, markdown, or code fences
3. Maintain proper indentation and style consistent with the existing code
4. Follow ${context.language} best practices
5. Keep the suggestion concise and contextually appropriate
6. Return raw code only, nothing else

Generate the code completion now:`
}

// CHANGED: Updated to use Gemini API
async function generateSuggestion(prompt:string):Promise<string>{
    try {
        // Get API key from environment variable
        const apiKey = process.env.GEMINI_API_KEY
        
        if (!apiKey) {
            console.error("GEMINI_API_KEY not found in environment variables")
            return "// API key not configured"
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 500,
                        topP: 0.95,
                        topK: 40
                    }
                })
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error("Gemini API error:", response.status, errorText)
            throw new Error(`Gemini API error: ${response.status}`)
        }

        const data = await response.json()
        
        // Extract text from Gemini response
        let suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
        
        if (!suggestion) {
            console.warn("No suggestion in Gemini response")
            return "// No suggestion available"
        }

        // Clean up the suggestion - remove markdown code blocks if present
        if (suggestion.includes("```")) {
            const codeMatch = suggestion.match(/```[\w]*\n?([\s\S]*?)```/)
            suggestion = codeMatch ? codeMatch[1].trim() : suggestion
        }

        // Remove any leading/trailing whitespace and return
        return suggestion.trim()

    } catch (error) {
        console.error("AI generation error:", error)
        return "// AI suggestion unavailable"
    }
}
