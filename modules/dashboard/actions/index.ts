"use server"
import { prisma } from "@/lib/db"
import { currentUser } from "@/modules/auth/actions"
import { revalidatePath } from "next/cache"

export const getAllPlaygrounds = async () => {
    try {
        const user = await currentUser()
        if (!user) {
            return []
        }
        const playgrounds = await prisma.playground.findMany({
            where: { userId: user?.id},
            include: {user:true,Starmark:{
                where:{
                    userId:user?.id
                },
                select:{isMarked:true}
            }},
            orderBy: { updatedAt: "desc" }
        })
        return playgrounds
    } catch (error) {
        console.log("Error in getAllPlaygrounds: ", error)
        
    }

     
    }


export const createPlayground = async(data:{
    title:string;
    template:"REACT"|"NEXTJS"|"EXPRESS"|"VUE"|"HONO"|"ANGULAR";
    description?:string;
}) => {
    const user = await currentUser();
    const {title,template,description} = data;
    try {
        const playground = await prisma.playground.create({

            data:{
                title:title,
                description:description,
                template:template,
                userId:user?.id!
            }
        })

        return playground;
    } catch (error) {
        console.log(error)
    }

}

export const deleteProject = async(id:string) => {
    try {
        await prisma.playground.delete({
            where:{
                id
            }
        })
        revalidatePath("/dashboard")
    } catch (error) {
        console.log(error)
    }

}

export const editProjectById = async(id:string,data:{title:string,description:string}) => {
    try {
        await prisma.playground.update({where:{id},data:data})
        revalidatePath("/dashboard")
    }catch(error){
        console.log(error)

    }


}

export const duplicateProjectId = async(id:string) => {
    try{
        const originalPlayground = await prisma.playground.findUnique({
            where:{id},

        })
        if(!originalPlayground){
            throw new Error("Original playground not found")
        }

        const duplicatedPlayground = await prisma.playground.create({
            data:{
                title:`${originalPlayground.title} (Copy)`,
                description:`${originalPlayground.description}`,
                template:originalPlayground.template,
                userId:originalPlayground.userId

            }
        })

        revalidatePath("/dashboard")
        return duplicatedPlayground


    }catch(error){
      console.log(error)
    }
}

export const toggleStarMarked = async(playgroundId:String,isChecked:boolean)=>{
    const user = await currentUser()
    const userId = user?.id;
    if(!userId){
        throw new Error("User ID is required")
    }
    try {
        if(isChecked){
        await prisma.starMark.create({
            data:{
                userId:userId!,
                // @ts-ignore
                playgroundId,
                isMarked:isChecked
            }
        })
        }else{
            await prisma.starMark.delete({

                where:{
                    
                     userId_playgroundId: {
                     userId: userId,
      //@ts-ignore
                     playgroundId: playgroundId,
                    },
                }
            })
        }
        revalidatePath("/dashboard")
        return {success:true,isMarked:isChecked}
    } catch (error) {
        console.log("Error updating problem:",error);
        return {success:false,error:"Failed to update problem"}
    }
}