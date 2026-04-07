"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const getUserById = async(id:string)=>{
    try {
        const user = await prisma.user.findUnique({
            where:{
                id:id
            }
        })
        return user;
    } catch (error) {
        console.log(error)
        return null;

        
    }
}

export const getAccountByUserId = async(userId:string)=>{
    try {
        const account = await prisma.account.findFirst({
            where:{userId}
        })

        return account;
    } catch (error) {
        console.log(error)
        return null
    }
}

export const currentUser = async()=>{
    const session = await auth();
    return session?.user;


}