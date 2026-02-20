"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  ImageUpload,
  type ImageUploadResult,
} from "@/components/ui/upload/ImageUpload";
import { useTRPC } from "@/trpc/react";

/**
 * User profile image upload component.
 * Allows users to upload, replace, or remove their profile picture.
 */
export function UserProfileImageUpload() {
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();

  const { data: user } = useQuery(trpc.user.me.queryOptions());

  const updateProfileMutation = useMutation(
    trpc.user.updateProfile.mutationOptions({
      onSuccess: () => {
        toast.success("Profile image updated successfully");
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update profile image");
      },
    }),
  );

  // Memoize existingImages to prevent infinite re-renders
  const existingImages = useMemo(() => [], []);

  const handleUploadComplete = (result: ImageUploadResult) => {
    setUploading(false);
    updateProfileMutation.mutate({
      image: result.url,
    });
  };

  const handleUploadStart = () => {
    setUploading(true);
    toast.info("Uploading profile image...");
  };

  const handleUploadError = (error: string) => {
    setUploading(false);
    toast.error(`Image upload failed: ${error}`);
  };

  const handleRemove = async () => {
    if (!user?.image) return;

    try {
      await updateProfileMutation.mutateAsync({
        image: null,
      });
    } catch (error) {
      console.error("Remove error:", error);
    }
  };

  const handleReplace = () => {
    // Trigger file input for replacement
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      handleUploadStart();

      try {
        // Upload through the server API
        const searchParams = new URLSearchParams();
        searchParams.set("filename", file.name);
        searchParams.set("alt", `${user?.name || "User"} profile image`);
        searchParams.set("resourceType", "user");
        if (user?.id) {
          searchParams.set("resourceId", user.id);
        }

        const response = await fetch(
          `/api/blob/upload?${searchParams.toString()}`,
          {
            method: "POST",
            body: file,
          },
        );

        if (!response.ok) {
          const error = (await response.json()) as {
            error?: string;
          };
          throw new Error(error.error || "Upload failed");
        }

        const result = (await response.json()) as ImageUploadResult;
        handleUploadComplete(result);
      } catch (error) {
        handleUploadError(
          error instanceof Error ? error.message : "Upload failed",
        );
      }
    };
    input.click();
  };

  // Generate initials for fallback
  const getInitials = () => {
    const name = user?.displayUsername || user?.name || user?.email;
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isLoading = uploading || updateProfileMutation.isPending;

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Current Avatar Preview */}
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage
            src={user.image ?? undefined}
            alt={user.displayUsername || user.name || user.email || "User"}
          />
          <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-medium">
            {user.displayUsername || user.name || "User"}
          </p>
          <p className="text-muted-foreground text-sm">
            {user.image ? "Custom image" : "Default avatar"}
          </p>
        </div>
      </div>

      {/* Upload Component - Only show when no image (empty state) */}
      {!user.image && (
        <ImageUpload
          onUploadComplete={handleUploadComplete}
          onUploadStart={handleUploadStart}
          onUploadError={handleUploadError}
          existingImages={existingImages}
          maxImages={1}
          maxSize={5 * 1024 * 1024} // 5MB
          uploadMode="auto"
          resourceType="user"
          resourceId={user.id}
          showPreview={false}
          aspectRatio="square"
          placeholder="Upload profile image"
          disabled={isLoading}
        />
      )}

      {/* When user has an image, show replace and remove options */}
      {user.image && (
        <div className="space-y-3">
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReplace}
              disabled={isLoading}
            >
              <Upload className="mr-2 size-4" />
              Replace Image
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Remove Image
            </Button>
          </div>
          <p className="text-muted-foreground text-center text-xs">
            Replace with a new image or remove to restore the default avatar
          </p>
        </div>
      )}

      {isLoading && (
        <div className="text-muted-foreground text-center text-sm">
          {uploading ? "Uploading..." : "Updating profile..."}
        </div>
      )}
    </div>
  );
}
