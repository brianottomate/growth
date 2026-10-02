import { getClientPageActivity } from "@/server/services/client-page-activity.service";
const labels = {
  pitch: "Pitch",
  intake: "Intake",
  social_connect: "Account connection",
  email_dns: "Email setup",
};
export async function ClientPageActivity({
  brandId,
  orgId,
}: {
  brandId: string;
  orgId: string;
}) {
  const rows = await getClientPageActivity(brandId, orgId);
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Client page activity</h2>
      <p className="text-sm text-muted-foreground">
        Views count sessions with at least three seconds in a visible tab. A
        forwarded link does not identify its viewer.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recorded views yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Page</th>
                <th>Views</th>
                <th>First viewed (UTC)</th>
                <th>Last viewed (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.surface} className="border-t">
                  <td className="py-2">{labels[row.surface]}</td>
                  <td>{row.views}</td>
                  <td>
                    {row.firstViewedAt
                      ? new Date(row.firstViewedAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)
                      : "—"}
                  </td>
                  <td>
                    {row.lastViewedAt
                      ? new Date(row.lastViewedAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
