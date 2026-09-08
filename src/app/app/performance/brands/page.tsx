import { redirect } from "next/navigation";

/** The brands live on the Clients and Prospects tabs; this path only forwards. */
export default function PerformanceBrandsIndex() {
  redirect("/app/performance/clients");
}
