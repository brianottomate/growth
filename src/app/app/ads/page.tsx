import { redirect } from "next/navigation";

/** The ads desk moved into Wander Performance; old links follow it. */
export default function AdsPage() {
  redirect("/app/performance/clients");
}
