"use server"

import { prisma } from "@/lib/db"
import { TemplateFolder } from "../lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";

export const getPlaygroundById = async(id: string) => {
    try {
        const playground = await prisma.playground.findUnique({
            where: {
                id
            },
            include: {
                templateFiles: true,  // ✅ Add this
                user: true,           // Optional: if you need user data
                Starmark: true,       // Optional: if you need starmark data
            }
        })

        return playground;
    } catch (error) {
        console.log(error)
        throw error; // Better to throw the error so you can handle it upstream
    }
}
export const SaveUpdatedCode = async(plagroundId:string,data:TemplateFolder) => {
    const user = await currentUser();
    if(!user){
        return null;
    }
    try {
        const updatedPlayground = await prisma.templateFile.upsert({
            where:{plagroundId},
            update:{content:JSON.stringify(data)},
            create:{plagroundId,content:JSON.stringify(data)}
        })
        return updatedPlayground;
    } catch (error) {
        console.log("SaveUpdatedCode error:",error);
        return null;
    }

}