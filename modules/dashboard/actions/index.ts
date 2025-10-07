"use server"
import { prisma } from "@/lib/db"
import { currentUser } from "@/modules/auth/actions"

export const getAllPlaygrounds = async () => {
    try {
        const user = await currentUser()
        if (!user) {
            return []
        }
        const playgrounds = await prisma.playground.findMany({
            where: { userId: user?.id},
            include: {user:true},
            orderBy: { updatedAt: "desc" }
        })
        return playgrounds
    } catch (error) {
        console.log("Error in getAllPlaygrounds: ", error)
        
    }

     
    }