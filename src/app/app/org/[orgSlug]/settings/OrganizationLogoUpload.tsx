"use client";

import { useMutation } from "@tanstack/react-query";
import { Building2, Trash2, Upload } from "lucide-react";
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

interface OrganizationLogoUploadProps {
  organizationId: string;
  currentLogo?: string | null;
  orgSlug: string;
  organizationName?: string;
}

export function OrganizationLogoUpload({
  organizationId,
  currentLogo,
  orgSlug: _orgSlug,
  organizationName = "Organization",
}: OrganizationLogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();

  const updateOrgMutation = useMutation(
    trpc.org.update.mutationOptions({
      onSuccess: () => {
        toast.success("Organization logo updated successfully");
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update organization logo");
      },
    }),
  );

  // Memoize existingImages to prevent infinite re-renders
  const existingImages = useMemo(() => [], []);

  const handleUploadComplete = (result: ImageUploadResult) => {
    setUploading(false);
    updateOrgMutation.mutate({
      organizationId,
      logo: result.url,
    });
  };

  const handleUploadStart = () => {
    setUploading(true);
    toast.info("Uploading organization logo...");
  };

  const handleUploadError = (error: string) => {
    setUploading(false);
    toast.error(`Logo upload failed: ${error}`);
  };

  const handleRemove = async () => {
    if (!currentLogo) return;

    try {
      await updateOrgMutation.mutateAsync({
        organizationId,
        logo: null,
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
        searchParams.set("alt", `${organizationName} logo`);
        searchParams.set("resourceType", "organization");
        searchParams.set("resourceId", organizationId);

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

  const isLoading = uploading || updateOrgMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Current Logo Preview */}
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage src={currentLogo ?? undefined} alt={organizationName} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-medium">{organizationName}</p>
          <p className="text-muted-foreground text-sm">
            {currentLogo ? "Custom logo" : "Default logo"}
          </p>
        </div>
      </div>

      {/* Upload Component - Only show when no logo (empty state) */}
      {!currentLogo && (
        <ImageUpload
          onUploadComplete={handleUploadComplete}
          onUploadStart={handleUploadStart}
          onUploadError={handleUploadError}
          existingImages={existingImages}
          maxImages={1}
          maxSize={5 * 1024 * 1024} // 5MB
          uploadMode="auto"
          resourceType="organization"
          resourceId={organizationId}
          showPreview={false}
          aspectRatio="square"
          placeholder="Upload organization logo"
          disabled={isLoading}
        />
      )}

      {/* When organization has a logo, show replace and remove options */}
      {currentLogo && (
        <div className="space-y-3">
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReplace}
              disabled={isLoading}
            >
              <Upload className="mr-2 size-4" />
              Replace Logo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Remove Logo
            </Button>
          </div>
          <p className="text-muted-foreground text-center text-xs">
            Replace with a new logo or remove to restore the default
          </p>
        </div>
      )}

      {isLoading && (
        <div className="text-muted-foreground text-center text-sm">
          {uploading ? "Uploading..." : "Updating organization..."}
        </div>
      )}
    </div>
  );
}
