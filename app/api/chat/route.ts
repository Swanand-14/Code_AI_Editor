import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ChatMessage{
    role: string;
    content: string;
}

interface ChatRequestBody{
    message: string;
    history: ChatMessage[];
}

async function generateAiResponse(messages: ChatMessage[]): Promise<string>{
    const systemPrompt = `You are an expert AI coding assistant. You help developers with:
- Code explanations and debugging
- Best practices and architecture advice
- Writing clean, efficient code
- Troubleshooting errors
- Code reviews and optimizations

Always provide clear, practical answers. When showing code, use proper formatting with language-specific syntax.
Keep responses concise but comprehensive. Use code blocks with language specification when providing code examples.`

    const fullMessages = [
        {role: "system", content: systemPrompt},
        ...messages
    ]
    
    const prompt = fullMessages.map((msg: any) => `${msg.role}: ${msg.content}`).join("\n\n");
    const apiKey = process.env.GEMINI_API_KEY
    
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured");
    }
    
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, 
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
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                        topP: 0.95,
                        topK: 40
                    }
                })
            }
        )

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API error:", response.status, errorText);
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Gemini response:", JSON.stringify(data, null, 2));
        
        // CHANGE 1: Fixed response extraction - Gemini uses candidates[0].content.parts[0].text
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        // await prisma.chatMessage.create({
        //     data: {
        // })

        
        if (!aiResponse) {
            console.error("No text in Gemini response:", data);
            throw new Error("No response from AI Module");
        }
        
        return aiResponse.trim();

    } catch (error) {
        console.error("AI generation error", error);
        throw error; // CHANGE 2: Re-throw error instead of swallowing it
    }
}

export async function POST(req: NextRequest){
    try {
        const body: ChatRequestBody = await req.json()
        const {message, history = []} = body;
        
        if (!message || typeof message !== "string") {
            return NextResponse.json(
                {error: "Message is required and must be a string"},
                {status: 400}
            );
        }

        const validHistory = Array.isArray(history)
            ? history.filter((msg: any) => 
                typeof msg === 'object' &&
                typeof msg.role === 'string' &&
                typeof msg.content === 'string' &&
                ["user", "assistant"].includes(msg.role)
            )
            : [];
            
        const recentHistory = validHistory.slice(-10)
        const messages: ChatMessage[] = [
            ...recentHistory,
            {role: "user", content: message}
        ]

        const aiResponse = await generateAiResponse(messages);
        
        return NextResponse.json({
            response: aiResponse,
            timestamp: new Date().toISOString(),
            model: "gemini-2.0-flash-exp",
            tokens: aiResponse.length // Approximate token count
        })
        
    } catch (error: any) {
        console.error("Chat API error", error);
        return NextResponse.json(
            {
                error: "Internal Server Error",
                message: error.message || "Unknown error"
            },
            {status: 500}
        )
    }
}