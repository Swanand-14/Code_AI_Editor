// app/api/upload-tarball/route.ts
import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('tarball') as File;
    const templateType = formData.get('templateType') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No tarball file provided' },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(`${templateType}-base.tar.gz`, file, {
      access: 'public',
      addRandomSuffix: false, // Use consistent names
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      templateType,
      size: file.size,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload tarball' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to check existing tarballs
export async function GET() {
  // You can list blobs using @vercel/blob list() function
  return NextResponse.json({ message: 'Upload tarball via POST' });
}