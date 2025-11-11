import { NextRequest, NextResponse } from "next/server";
import { type CompletionRequestBody } from "monacopilot";

// Cache implementation with longer TTL
class CompletionCache {
  private cache = new Map<string, { completion: string; timestamp: number }>();
  private maxSize = 200; // Increased cache size
  private ttl = 30 * 60 * 1000; // 30 minutes (increased from 5)

  private hash(context: string): string {
    return Buffer.from(context).toString("base64").slice(0, 32);
  }

  get(context: string): string | null {
    const key = this.hash(context);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.completion;
  }

  set(context: string, completion: string): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(this.hash(context), {
      completion,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const cache = new CompletionCache();

// Rate limiter to prevent hitting Gemini limits
class RateLimiter {
  private requests: number[] = [];
  private maxRequestsPerMinute = 10; // Conservative limit for free tier

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => now - time < 60000);
    
    if (this.requests.length >= this.maxRequestsPerMinute) {
      console.warn(`⚠️ Rate limit: ${this.requests.length} requests in last minute`);
      return false;
    }
    
    this.requests.push(now);
    return true;
  }

  getWaitTime(): number {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    const timeToWait = 60000 - (Date.now() - oldestRequest);
    return Math.max(0, timeToWait);
  }
}

const rateLimiter = new RateLimiter();

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body: CompletionRequestBody & {
      fileName?: string;
      fileExtension?: string;
    } = await req.json();

    console.log('🚀 Copilot completion request:', {
      language: body.language,
      textBeforeLength: body.textBeforeCursor?.length,
      textAfterLength: body.textAfterCursor?.length,
      fileName: body.fileName,
      textBeforePreview: body.textBeforeCursor?.slice(-100)
    });

    // Validate request - textAfterCursor can be empty string
    if (
      typeof body.textBeforeCursor !== 'string' ||
      typeof body.textAfterCursor !== 'string' ||
      !body.language
    ) {
      console.error('❌ Invalid request body:', {
        hasTextBefore: typeof body.textBeforeCursor,
        hasTextAfter: typeof body.textAfterCursor,
        hasLanguage: !!body.language
      });
      return NextResponse.json({ completion: "" }, { status: 200 });
    }

    // Check cache first
    const cacheKey = `${body.language}:${body.textBeforeCursor.slice(-500)}:${body.textAfterCursor.slice(0, 100)}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`✅ Cache hit (${Date.now() - startTime}ms)`);
      return NextResponse.json({ completion: cached });
    }

    console.log('📡 Generating new completion...');

    // Generate completion
    const completion = await generateGeminiCompletion({
      textBeforeCursor: body.textBeforeCursor,
      textAfterCursor: body.textAfterCursor,
      language: body.language,
      fileName: body.fileName,
      fileExtension: body.fileExtension,
    });

    // Store in cache
    if (completion) {
      cache.set(cacheKey, completion);
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 Completion generated (${duration}ms):`, completion.slice(0, 100) + "...");

    return NextResponse.json({ completion });
  } catch (error: any) {
    console.error(`❌ Error (${Date.now() - startTime}ms):`, error);
    return NextResponse.json({ completion: "" }, { status: 200 });
  }
}

// ============================================
// Gemini API Integration
// ============================================

interface CompletionContext {
  textBeforeCursor: string;
  textAfterCursor: string;
  language: string;
  fileName?: string;
  fileExtension?: string;
}

async function generateGeminiCompletion(
  context: CompletionContext
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("GEMINI_API_KEY not configured");
    return "";
  }

  try {
    const prompt = buildIntelligentPrompt(context);
    
    console.log('📝 Prompt sent to Gemini:', prompt.slice(0, 200) + '...');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
            topP: 0.95,
            topK: 40,
            stopSequences: ["\n\n\n"],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini API error: ${response.status}`, errorText);
      return "";
    }

    const data = await response.json();
    
    console.log('📦 Raw Gemini response:', JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.error('❌ Gemini API returned error:', data.error);
      return "";
    }

    let completion = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    console.log('🔍 Raw completion before cleaning:', completion);

    // Clean and validate completion
    completion = cleanCompletion(completion);
    
    console.log('✨ Cleaned completion:', completion);
    
    // Reject if completion is too short (likely character-by-character)
    if (completion.length < 3) {
      console.warn('⚠️ Completion too short, rejecting:', completion);
      return "";
    }

    return completion;
  } catch (error: any) {
    console.error("❌ Gemini generation error:", error.message || error);
    return "";
  }
}

function buildIntelligentPrompt(context: CompletionContext): string {
  const { textBeforeCursor, textAfterCursor, language, fileName } = context;

  // Get last 50 lines for better context
  const lines = textBeforeCursor.split("\n");
  const recentContext = lines.slice(-50).join("\n");
  const currentLine = lines[lines.length - 1] || "";
  const indentation = currentLine.match(/^\s*/)?.[0] || "";

  // Detect framework
  const framework = detectFramework(textBeforeCursor);

  // Detect what user is trying to do
  const intent = detectIntent(currentLine, textBeforeCursor);

  return `You are a smart code completion AI for ${language}. Complete ONLY what comes after the cursor.

Context:
${framework !== "None" ? `Framework: ${framework}` : ""}
${fileName ? `File: ${fileName}.${context.fileExtension}` : ""}

Full code BEFORE cursor (what's already typed):
\`\`\`${language}
${recentContext}
\`\`\`

Current incomplete line:
"${currentLine}"

Code AFTER cursor:
\`\`\`${language}
${textAfterCursor.split("\n").slice(0, 5).join("\n")}
\`\`\`

Detected intent: ${intent}
Indentation: ${indentation.length} spaces

CRITICAL INSTRUCTIONS:
1. Look at the current line: "${currentLine}"
2. Complete ONLY what naturally comes NEXT from where the cursor is
3. DO NOT repeat any code that's already in "Full code BEFORE cursor"
4. DO NOT suggest code that's already after the cursor
5. If user typed "con", suggest "sole.log()" NOT "st app = new Hono();"
6. If user typed "function hel", suggest "lo() {\n  \n}" NOT the whole function
7. Provide 10-50 characters of meaningful completion
8. Match indentation exactly
9. Return ONLY the completion text, NO markdown, NO explanations

Examples:
- Line: "con" → Complete: "sole.log()"
- Line: "const result = " → Complete: "await fetch('https://api.example.com')"
- Line: "app.get('/api', " → Complete: "(c) => {\n  return c.json({ })\n})"
- Line: "function hello" → Complete: "() {\n  \n}"

Your completion (ONLY the text to insert after "${currentLine}"):`;
}

function detectFramework(code: string): string {
  if (/from\s+['"]react['"]|import\s+React/.test(code)) return "React";
  if (/@Component|@angular/.test(code)) return "Angular";
  if (/from\s+['"]vue['"]/.test(code)) return "Vue";
  if (/from\s+['"]next/.test(code)) return "Next.js";
  if (/express\(\)|app\.(get|post)\(/.test(code)) return "Express";
  if (/from\s+fastapi/.test(code)) return "FastAPI";
  if (/from\s+['"]@hono/.test(code)) return "Hono";
  return "None";
}

function detectIntent(currentLine: string, fullContext: string): string {
  const trimmedLine = currentLine.trim();
  
  // Function declaration
  if (/^\s*function\s+\w*$/.test(currentLine)) {
    return "declaring a function - need parameters and body";
  }
  
  // Arrow function
  if (/^\s*const\s+\w+\s*=\s*\(.*\)\s*=>?\s*$/.test(currentLine)) {
    return "arrow function - need function body";
  }
  
  // Method call
  if (/\.\w*$/.test(trimmedLine)) {
    return "method call - need method name and arguments";
  }
  
  // Variable declaration
  if (/^\s*(const|let|var)\s+\w+\s*=?\s*$/.test(currentLine)) {
    return "variable declaration - need value assignment";
  }
  
  // Conditional
  if (/^\s*(if|while|for)\s*\(.*\)?\s*$/.test(currentLine)) {
    return "conditional statement - need condition and body";
  }
  
  // Import statement
  if (/^\s*import\s+/.test(currentLine)) {
    return "import statement - need module name";
  }
  
  // Object literal
  if (/\{\s*$/.test(trimmedLine)) {
    return "object literal - need properties";
  }
  
  // Array literal
  if (/\[\s*$/.test(trimmedLine)) {
    return "array literal - need elements";
  }
  
  // Class declaration
  if (/^\s*class\s+\w*/.test(currentLine)) {
    return "class declaration - need class body";
  }
  
  return "continuing code";
}

function detectPatterns(line: string): string[] {
  const patterns: string[] = [];

  if (/^\s*(if|while|for)\s*\($/.test(line.trim())) patterns.push("conditional");
  if (/^\s*(function|const\s+\w+\s*=)/.test(line.trim())) patterns.push("function");
  if (/\{\s*$/.test(line)) patterns.push("object");
  if (/\[\s*$/.test(line)) patterns.push("array");
  if (/=\s*$/.test(line)) patterns.push("assignment");
  if (/\.\s*$/.test(line)) patterns.push("method-call");

  return patterns;
}

function cleanCompletion(completion: string): string {
  return completion
    .replace(/```[\w]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/^(Here's|Here is|The code|This|Try|Your completion).*?:\s*/i, "")
    .replace(/^(\/\/|#)\s*Complete.*$/gm, "")
    .replace(/^(\/\/|#)\s*Completion.*$/gm, "")
    .trim();
}