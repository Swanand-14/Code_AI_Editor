import { readTemplateStructureFromJson,saveTemplateStructureToJson } from "@/modules/playground/lib/path-to-json";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import { templatePaths } from "@/lib/template";

import path from "path";

function validateJsonStructure(data:unknown):boolean{
    try{
        JSON.parse(JSON.stringify(data));
        return true;
    }catch(error){
        console.error("Invalid Json structure",error);
        return false;

    }
}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
    const {id} = await params;
    if(!id){
        return Response.json({error:"Missing playground id"},{status:400});

    }
    const playground = await prisma.playground.findUnique({where:{id}})
    if(!playground){return Response.json({error:"Playground not found"},{status:404});
}
const templateKey = playground.template as keyof typeof templatePaths;
const templatePath = templatePaths[templateKey];
if(!templatePath){
    return Response.json({error:"Invalid template path"},{status:404})
}
try {
    const inputPath = path.join(process.cwd(),templatePath);
    const outputPath = path.join(process.cwd(),`output/${templateKey}.json`);
    await saveTemplateStructureToJson(inputPath,outputPath);
    const result = await readTemplateStructureFromJson(outputPath);
    if(!validateJsonStructure(result)){
        return Response.json({error:"Invalid JSON structure"})
    }
    await fs.unlink(outputPath);
    return Response.json({success:true,templateJson:result},{status:200});




} catch (error) {
    console.error("Error reading template Json file",error);
    return Response.json({error:"Failed to read template JSON file"},{status:500});
}

}