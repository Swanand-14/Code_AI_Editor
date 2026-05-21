import JSZip from "jszip";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { TemplateFile } from "@prisma/client";

type TreeItem = TemplateFile | TemplateFolder;

function isFolder(item: TreeItem): item is TemplateFolder {
  return "folderName" in item;
}

function addItemsToZip(
  zip: JSZip,
  items: TreeItem[],
  basePath: string = ""
): void {
  for (const item of items) {
    if (isFolder(item)) {
      const folderPath = basePath ? `${basePath}/${item.folderName}` : item.folderName;
      addItemsToZip(zip, item.items as TreeItem[], folderPath);
    } else {
      const filePath = basePath
        ? `${basePath}/${item.filename}.${item.fileExtension}`
        : `${item.filename}.${item.fileExtension}`;
      zip.file(filePath, item.content ?? "");
    }
  }
}

export async function downloadProjectAsZip(
  templateData: TemplateFolder,
  projectName: string = "playground"
): Promise<void> {
  const zip = new JSZip();

  addItemsToZip(zip, templateData.items as TreeItem[]);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/[^a-z0-9_\-]/gi, "_")}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}