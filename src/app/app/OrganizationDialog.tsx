"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { useTRPC } from "@/trpc/react";

interface OrganizationDialogProps {
  trigger?: React.ReactNode;
}

export function OrganizationDialog({ trigger }: OrganizationDialogProps) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const { data: organizations, isLoading } = useQuery(
    trpc.org.list.queryOptions(),
  );

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="gap-2">
      <Building2 className="size-4" />
      Organizations
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-[425px] sm:mx-auto sm:w-full">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Building2 className="size-5" />
            Your Organizations
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Manage your organizations and teams. Create a new organization to
            collaborate with others.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4 sm:pb-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 sm:py-8">
              <div className="text-muted-foreground text-sm">
                Loading organizations...
              </div>
            </div>
          ) : organizations?.length === 0 ? (
            <div className="py-6 text-center sm:py-8">
              <Building2 className="text-muted-foreground mx-auto mb-3 size-10 sm:mb-4 sm:size-12" />
              <h3 className="mb-2 text-base font-medium sm:text-lg">
                No organizations yet
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">
                Create your first organization to start collaborating with
                others.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {organizations?.map((org) => (
                <Link
                  key={org.id}
                  href={`/app/org/${org.slug}`}
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarImage src={org.logo || undefined} alt={org.name} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <Building2 className="size-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium sm:text-base">
                        {org.name}
                      </div>
                      <div className="text-muted-foreground truncate text-xs capitalize">
                        {"role" in org && typeof org.role === "string"
                          ? org.role
                          : "member"}
                      </div>
                    </div>
                  </div>
                  <Users className="text-muted-foreground size-4 shrink-0" />
                </Link>
              ))}
            </div>
          )}

          <Separator />

          <Link href="/app/org/create" onClick={() => setOpen(false)}>
            <Button className="h-10 w-full gap-2 text-sm font-medium sm:h-9">
              <Plus className="size-4" />
              Create New Organization
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
