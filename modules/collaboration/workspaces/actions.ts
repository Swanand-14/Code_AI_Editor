"use server";

import { prisma } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

export async function createCollabWorkspace(data: {
  sessionId: string;
  name: string;
  templateData: TemplateFolder; // 🔥 Simple - entire template object
}): Promise<{ success: boolean; workSpaceId?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return { success: false, error: "Authentication required" };
    }

    console.log("📥 Creating workspace:", data.sessionId);

    // 🔥 SIMPLE: Just like TemplateFile - stringify and store
    const workspace = await prisma.collabWorkspace.create({
      data: {
        name: data.name,
        sessionId: data.sessionId,
        templateData: JSON.stringify(data.templateData), // Same as your TemplateFile pattern
        ownerId: user.id,
      },
    });

    console.log("✅ Workspace created:", workspace.id);
    return { success: true, workSpaceId: workspace.id };
  } catch (error) {
    console.error("❌ Error creating workspace:", error);
    return { success: false, error: "Failed to create workspace" };
  }
}

export async function updateCollabWorkspace(data: {
  sessionId: string;
  templateData: TemplateFolder;
  userId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // 🔥 SIMPLE: Just like your SaveUpdatedCode
    await prisma.collabWorkspace.update({
      where: { sessionId: data.sessionId },
      data: {
        templateData: JSON.stringify(data.templateData), // Same pattern
        lastSavedAt: new Date(),
      },
    });

    console.log(`💾 Workspace saved: ${data.sessionId}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Error updating workspace:", error);
    return { success: false, error: "Failed to update workspace" };
  }
}
export async function getAllCollabWorkspaces() {
  try {
    const user = await currentUser();
    if (!user?.id) return [];

    const workspaces = await prisma.collabWorkspace.findMany({
      where: { ownerId: user.id ,templateData: { not: null }},
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return workspaces;
  } catch (error) {
    console.error("❌ Error fetching workspaces:", error);
    return [];
  }
}

export async function getCollabWorkspaceBySession(sessionId: string) {
  try {
    const workspace = await prisma.collabWorkspace.findUnique({
      where: { sessionId },
      include: {
        owner: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    if (!workspace) {
      return null;
    }

    // 🔥 SIMPLE: Parse JSON back to object (like your getPlaygroundById)
    return {
      ...workspace,
      templateData: JSON.parse(workspace.templateData as string) as TemplateFolder,
    };
  } catch (error) {
    console.error("❌ Error fetching workspace:", error);
    return null;
  }
}

export async function deleteCollabWorkspace(sessionId: string) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return { success: false, error: "Authentication required" };
    }

    const workspace = await prisma.collabWorkspace.findUnique({
      where: { sessionId },
    });

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    if (workspace.ownerId !== user.id) {
      return { success: false, error: "Not authorized" };
    }

    await prisma.collabWorkspace.delete({
      where: { sessionId },
    });

    return { success: true };
  } catch (error) {
    console.error("❌ Error deleting workspace:", error);
    return { success: false, error: "Failed to delete workspace" };
  }
}