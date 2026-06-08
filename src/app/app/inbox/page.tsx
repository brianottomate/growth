import { redirect } from "next/navigation";

// Inbox merged into Listen (one unified inbound surface). Keep this route as a
// redirect so old links / bookmarks land on the DMs tab.
export default function InboxPage() {
  redirect("/app/listen?tab=dms");
}
