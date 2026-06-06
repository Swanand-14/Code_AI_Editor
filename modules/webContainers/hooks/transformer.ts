import type { TemplateFile, TemplateFolder, TemplateItem } from "@/modules/playground/lib/path-to-json";

interface WebContainerFile {
  file: { contents: string };
}

interface WebContainerDirectory {
  directory: { [key: string]: WebContainerFile | WebContainerDirectory };
}

type WebContainerFileSystem = Record<string, WebContainerFile | WebContainerDirectory>;

export function transformToWebContainerFormat(template: TemplateFolder): WebContainerFileSystem {
  function processItem(item: TemplateItem): WebContainerFile | WebContainerDirectory {
    if ("folderName" in item) {
      // TypeScript now knows item is TemplateFolder
      const directoryContents: WebContainerFileSystem = {};
      item.items.forEach(subItem => {
        const key = "folderName" in subItem
          ? subItem.folderName
          : `${subItem.filename}.${subItem.fileExtension}`;
        directoryContents[key] = processItem(subItem);
      });
      return { directory: directoryContents };
    } else {
      // TypeScript now knows item is TemplateFile
      return { file: { contents: item.content } };
    }
  }

  const result: WebContainerFileSystem = {};
  template.items.forEach(item => {
    const key = "folderName" in item
      ? item.folderName
      : `${item.filename}.${item.fileExtension}`;
    result[key] = processItem(item);
  });

  return result;
}