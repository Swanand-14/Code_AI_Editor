"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { downloadProjectAsZip } from "@/modules/playground/lib/Download-service";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

interface DownloadButtonProps {
  templateData: TemplateFolder | null | undefined;
  projectName?: string;
}

export function DownloadButton({ templateData, projectName = "playground" }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!templateData) {
      toast.error("No project data available to download");
      return;
    }

    try {
      setIsDownloading(true);
      toast.loading("Preparing download…", { id: "download-zip" });
      await downloadProjectAsZip(templateData, projectName);
      toast.success("Download started!", { id: "download-zip" });
    } catch (err) {
      console.error("Download failed:", err);
      toast.error("Failed to create zip file", { id: "download-zip" });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={isDownloading || !templateData}
          aria-label="Download project as zip"
        >
          <Download className={`h-4 w-4 ${isDownloading ? "animate-bounce" : ""}`} />
          {isDownloading && <span className="ml-1 text-xs">Zipping…</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Download project as .zip</TooltipContent>
    </Tooltip>
  );
}