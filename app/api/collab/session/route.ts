export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { createCollabSession } from "@/modules/collaboration/actions";
import { buildCollabUrl } from "@/modules/collaboration/lib/utils";
import type { CreateCollabSessionRequest } from "@/modules/collaboration/types";

export async function POST(request: NextRequest) {
  try {
    const body: CreateCollabSessionRequest = await request.json();

    // Validate request body
    if (!body.projectType) {
      return NextResponse.json(
        { success: false, error: "Project type is required" },
        { status: 400 }
      );
    }

    // Create session
    const result = await createCollabSession(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Build share URL
    const shareUrl = buildCollabUrl(result.sessionId!);

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      shareUrl,
    });
  } catch (error) {
    console.error("API error creating collab session:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}