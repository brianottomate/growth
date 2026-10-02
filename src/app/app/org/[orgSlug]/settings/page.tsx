import { redirect } from "next/navigation";

export default function LegacyOrganizationPage() {
  redirect("/app/people");
}
