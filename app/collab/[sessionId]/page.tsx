import { redirect } from "next/navigation";
import { getCollabSession } from "@/modules/collaboration/actions";
import { CollabPlayground } from "@/modules/collaboration/components/CollabPlayground";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CollabPageProps {
  params: {
    sessionId: string;
  };
}

export default async function CollabPage({ params }: CollabPageProps) {
  const { sessionId } = params;

  // Fetch session from database
  const result = await getCollabSession(sessionId);

  // Handle errors
  if (!result.success || !result.session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          {result.error || "This collaboration session doesn't exist or has expired."}
        </p>
        <Link href="/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // For starter projects, redirect to collab playground
  if (result.session.projectType === "starter") {
    return <CollabPlayground session={result.session} />;
  }

  // Future: Handle GitHub projects
  return (
    <div className="flex flex-col items-center justify-center h-screen p-4">
      <h1 className="text-2xl font-bold mb-2">Coming Soon</h1>
      <p className="text-muted-foreground">
        GitHub collaboration is not yet implemented
      </p>
    </div>
  );
}