import { FileUploadExamples } from "./file-upload-examples";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * FILE UPLOAD BEST PRACTICES
 *
 * This demo showcases file upload patterns using:
 * - react-dropzone (drag and drop)
 * - Vercel Blob storage
 * - Progress tracking
 * - File validation
 * - Multiple file uploads
 */

export default function FileUploadDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">File Upload Demo</h1>
        <p className="text-muted-foreground">
          Drag-and-drop file uploads with Vercel Blob storage and validation
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">🎯 File Upload Stack:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>react-dropzone</strong> - Drag and drop file input with
                built-in validation
              </li>
              <li>
                <strong>Vercel Blob</strong> - Serverless blob storage with CDN
              </li>
              <li>
                <strong>Server Actions</strong> - Upload files without API
                routes
              </li>
              <li>
                <strong>Client-side validation</strong> - File type, size checks
                before upload
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">✅ Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Validate file types and sizes on both client and server</li>
              <li>Show upload progress for better UX</li>
              <li>Handle errors gracefully (network, file size, etc.)</li>
              <li>Provide visual feedback (drag states, previews)</li>
              <li>Use optimistic updates when appropriate</li>
              <li>Clean up URLs with URL.revokeObjectURL()</li>
              <li>Store blob URLs in database for retrieval</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* File Upload Examples */}
      <FileUploadExamples />

      {/* Code Pattern */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Code Pattern</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">
              1. Server Action for Upload
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`// app/actions/upload.ts
"use server";

import { put } from "@vercel/blob";
import { auth } from "@/server/better-auth";

export async function uploadFile(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const file = formData.get("file") as File;

  if (!file) {
    throw new Error("No file provided");
  }

  // Server-side validation
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error("File too large");
  }

  // Upload to Vercel Blob
  const blob = await put(file.name, file, {
    access: "public",
  });

  return {
    url: blob.url,
    size: file.size,
    name: file.name,
  };
}`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              2. Client Component with Dropzone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`"use client";

import { useDropzone } from "react-dropzone";
import { uploadFile } from "@/app/actions/upload";
import { toast } from "sonner";

export function FileUpload() {
  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadFile(formData);
      toast.success("File uploaded!");
      console.log("Blob URL:", result.url);
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif"],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8",
        isDragActive && "border-primary bg-primary/5"
      )}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <p>Uploading...</p>
      ) : (
        <p>Drag and drop, or click to select</p>
      )}
    </div>
  );
}`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
