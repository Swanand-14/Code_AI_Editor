// app/preview/[sessionId]/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PreviewPage({ params }: { params: { sessionId: string } }) {
  const searchParams = useSearchParams();
  const serverUrl = searchParams.get("url");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverUrl) {
      setError("No preview URL provided");
      setIsLoading(false);
    }
  }, [serverUrl]);

  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);
    window.location.reload();
  };

  if (error || !serverUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Preview Not Available
          </h1>
          <p className="text-gray-600 mb-4">
            {error || "No WebContainer URL provided. Please use the preview button in the playground."}
          </p>
          <Button onClick={() => window.close()} variant="outline">
            Close Tab
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading preview...</p>
            <p className="text-xs text-gray-400 mt-2">Session: {params.sessionId}</p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-gray-100 border-b flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-gray-600 font-mono truncate max-w-md">
            {serverUrl}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          className="h-6"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Preview Iframe */}
      <iframe
        src={serverUrl}
        className="w-full h-full border-none"
        style={{ 
          marginTop: '40px',
          height: 'calc(100% - 40px)',
          backgroundColor: 'transparent' 
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
        allow="cross-origin-isolated"
        onLoad={() => {
          setIsLoading(false);
          setError(null);
        }}
        onError={() => {
          setIsLoading(false);
          setError("Failed to load preview");
        }}
        title="WebContainer Preview"
      />
    </div>
  );
}