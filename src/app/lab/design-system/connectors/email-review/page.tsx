import { EmailClientReview } from "@/app/email-preview/[token]/EmailClientReview";
import { clientReviewFixture } from "./fixture";
export const metadata = { title: "Email client preview · Growth Lab" };
export default async function ClientReviewLab() {
  return (
    <EmailClientReview
      preview={await clientReviewFixture()}
      printUrl="/lab/design-system/connectors/email-review/print"
    />
  );
}
