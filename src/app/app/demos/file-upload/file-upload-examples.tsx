"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * FILE UPLOAD EXAMPLES
 *
 * Demonstrates various file upload patterns with react-dropzone
 */

export function FileUploadExamples() {
  return (
    <div className="space-y-8">
      <BasicUploadExample />
      <MultipleFilesExample />
      <ImagePreviewExample />
    </div>
  );
}

// ============================================================
// EXAMPLE 1: Basic Single File Upload
// ============================================================

function BasicUploadExample() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadedUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    try {
      // Simulate upload (in real app, use Server Action)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Simulate blob URL
      const mockUrl = `https://blob.vercel-storage.com/demo/${file.name}`;
      setUploadedUrl(mockUrl);

      toast.success("File uploaded successfully!");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">1. Basic File Upload</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Single File with Drag & Drop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50",
            )}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p className="text-primary">Drop the file here...</p>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Drag and drop an image here, or click to select
                </p>
                <p className="text-muted-foreground text-xs">
                  PNG, JPG, GIF up to 5MB
                </p>
              </div>
            )}
          </div>

          {file && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button onClick={() => setFile(null)} variant="ghost" size="sm">
                  Remove
                </Button>
              </div>

              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full"
              >
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </div>
          )}

          {uploadedUrl && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-1 text-sm font-medium text-green-800">
                Upload successful!
              </p>
              <p className="text-xs break-all text-green-700">{uploadedUrl}</p>
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            Uses react-dropzone with file type and size validation
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 2: Multiple Files Upload
// ============================================================

function MultipleFilesExample() {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    toast.success(`Uploading ${files.length} files...`);
    // Simulate batch upload
    await new Promise((resolve) => setTimeout(resolve, 2000));
    toast.success("All files uploaded!");
    setFiles([]);
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">2. Multiple Files Upload</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batch Upload Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50",
            )}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p className="text-primary">Drop the files here...</p>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Drag and drop documents here, or click to select
                </p>
                <p className="text-muted-foreground text-xs">
                  PDF, DOC, DOCX up to 10MB each (max 5 files)
                </p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Selected files ({files.length})</p>
                <Button onClick={() => setFiles([])} variant="ghost" size="sm">
                  Clear All
                </Button>
              </div>

              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      onClick={() => removeFile(index)}
                      variant="ghost"
                      size="sm"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <Button onClick={handleUploadAll} className="w-full">
                Upload All Files
              </Button>
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            Supports multiple file selection and batch uploads
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 3: Image Upload with Preview
// ============================================================

function ImagePreviewExample() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);

      // Create preview URL
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif"],
    },
    maxSize: 5 * 1024 * 1024,
    maxFiles: 1,
  });

  const clearPreview = () => {
    setPreview(null);
    setFile(null);
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">3. Image Upload with Preview</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Image Preview Before Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!preview ? (
            <div
              {...getRootProps()}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50",
              )}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-primary">Drop the image here...</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Drag and drop an image, or click to select
                  </p>
                  <p className="text-muted-foreground text-xs">
                    PNG, JPG, GIF up to 5MB
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video overflow-hidden rounded-lg border">
                <Image
                  src={preview}
                  alt="Preview"
                  fill
                  unoptimized
                  className="bg-muted object-contain"
                />
              </div>

              {file && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {(file.size / 1024).toFixed(2)} KB •{" "}
                    {file.type || "Unknown type"}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={clearPreview}
                  variant="outline"
                  className="flex-1"
                >
                  Choose Different Image
                </Button>
                <Button
                  onClick={() => toast.success("Image uploaded!")}
                  className="flex-1"
                >
                  Upload Image
                </Button>
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            Shows image preview using FileReader API before uploading
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
