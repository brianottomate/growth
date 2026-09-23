import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { workspaceActor } from "@/server/workspace-actor";
import { BrandWorkspaceNav } from "./BrandWorkspaceNav";

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ brandSlug: string }>;
  children: ReactNode;
}) {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const { brandSlug } = await params;
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, actor.orgId),
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
      isNull(brandTable.deletedAt),
    ),
    columns: { slug: true, id: true, relationship: true },
  });
  if (!brand) notFound();
  return (
    <>
      <BrandWorkspaceNav
        slug={brand.slug ?? brand.id}
        performance={brand.relationship === "client"}
      />
      {children}
    </>
  );
}
