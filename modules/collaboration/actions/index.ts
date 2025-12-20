"use server";

import {prisma} from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import { generateSessionId,getSessionExpiration } from "../lib/utils";
import type { CreateCollabSessionRequest,CollabSessionData } from "../types";
import { getPlaygroundById } from "@/modules/playground/action";
import { get } from "node:http";

export async function createCollabSession(
  request: CreateCollabSessionRequest
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const user = await currentUser();
    
    
    if (request.projectType === "starter" && !request.playgroundId) {
      return { success: false, error: "Playground ID is required for starter projects" };
    }

  
    const sessionId = generateSessionId();
    const expiresAt = getSessionExpiration();

    
    let templateSnapshot = null;
    if (request.projectType === "starter" && request.playgroundId) {
      const playground = await getPlaygroundById(request.playgroundId);
      if (!playground) {
        return { success: false, error: "Playground not found" };
      }
      
      
      const rawContent = playground?.templateFiles?.[0]?.content;
      if (rawContent) {
        templateSnapshot = typeof rawContent === "string" 
          ? JSON.parse(rawContent) 
          : rawContent;
      }
    }

    
    const session = await prisma.collabSession.create({
      data: {
        sessionId,
        projectType: request.projectType,
        templateId: request.templateId,
        playgroundId: request.playgroundId,
        templateSnapshot: templateSnapshot as any,
        repoOwner: request.repoOwner,
        repoName: request.repoName,
        branch: request.branch,
        hostId: user?.id,
        hostType: user ? "authenticated" : "anonymous",
        expiresAt,
        isActive: true,
      },
    });

    
    if (user?.id) {
      await prisma.collabParticipant.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          role: "host",
          displayName: user.name || "Host",
        },
      });
    }

    return {
      success: true,
      sessionId: session.sessionId,
    };
  } catch (error) {
    console.error("Error creating collab session:", error);
    return {
      success: false,
      error: "Failed to create collaboration session",
    };
  }
}

export async function getCollabSession(sessionId:string):Promise<{success:boolean;session?:CollabSessionData;error?:string}>{
    try {
        const session  = await prisma.collabSession.findUnique({
            where:{sessionId},
            include:{
                hostUser:{
                    select:{
                        id:true,
                        name:true,
                        image:true
                    }
                },
                participants:{
                    include:{
                        user:{
                            select:{
                                id:true,
                                name:true,
                                image:true
                            }
                        }
                    }
                }
            },

        });

        if(!session){
            return {success:false,error:"Session not found"}

        }

        if(!session.isActive || new Date()>session.expiresAt){
            return {success:false,error:"Session got expired"}
        }

        return {
            success:true,
            session:session as any
        }
    } catch (error) {
        console.error("Error fetching collab session",error)
        return {
            success:false,
            error:"Failed to fetch Collaboration session"
        }
        
    }


}

export async function joinCollabSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    
    const session = await prisma.collabSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    if (!session.isActive || new Date() > session.expiresAt) {
      return { success: false, error: "Session has expired" };
    }

    // Create participant entry if user is authenticated and not already a participant
    if (user?.id) {
      await prisma.collabParticipant.upsert({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: user.id,
          },
        },
        update: {
          lastSeenAt: new Date(),
        },
        create: {
          sessionId: session.id,
          userId: user.id,
          role: "editor",
          displayName: user.name || "Guest",
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error joining collab session:", error);
    return {
      success: false,
      error: "Failed to join collaboration session",
    };
  }
}