import { NextRequest,NextResponse } from "next/server";
import { requireGitHubToken } from "@/modules/github/lib/github-token";
import { GitHubClient } from "@/modules/github/lib/github-client";

export async function GET(req:NextRequest){
    try {
        const {searchParams} = new URL(req.url)
        const owner = searchParams.get("owner")
        const repo = searchParams.get("repo")
        if(!owner || !repo){
            return NextResponse.json({error:"Missing owner or repo"},{status:400})
        }

        const token = await requireGitHubToken()
        const client = new GitHubClient(token)
        const octokit = (client as any).octokit
        const {data} = await octokit.repos.listBranches({
            owner,repo,per_page:100,
        })

        return NextResponse.json(data)

    } catch (error:any) {
        return NextResponse.json({error:error.message},{status:500})
    }
}

export async function POST(req:NextRequest){
    try {
        const body = await req.json()
        const {owner,repo,newBranch,fromBranch} = body
        if(!owner||!repo||!newBranch||!fromBranch){
            return NextResponse.json({error:"Missing required fields"},{status:400})
        }
        const token = await requireGitHubToken()
        const client = new GitHubClient(token)
        await client.createBranch(owner,repo,newBranch,fromBranch)
        return NextResponse.json({success:true})
        
    } catch (error:any) {
        return NextResponse.json({error:error.message},{status:500})
        
    }
} 