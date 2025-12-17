// scripts/upload-base-template.ts
import { put } from '@vercel/blob';
import fs from 'fs';

async function uploadTarball(filePath: string, templateType: string) {
  console.log(`📤 Uploading ${templateType}...`);
  
  const file = fs.readFileSync(filePath);
  
  const blob = await put(`${templateType}-base.tar.gz`, file, {
    access: 'public',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN, // Get from Vercel dashboard
  });

  console.log('✅ Uploaded to:', blob.url);
  return blob.url;
}

async function main() {
  console.log('📦 Uploading base templates to Vercel Blob...\n');

  const nextjsPath = './public/nextjs-13-tailwind.tar.gz';
  if (fs.existsSync(nextjsPath)) {
    const url = await uploadTarball(nextjsPath, 'nextjs-13-tailwind');
    console.log('\n🔗 Save this URL in your code:');
    console.log(url);
  } else {
    console.log('⚠️ Tarball not found at:', nextjsPath);
  }
}

main().catch(console.error);