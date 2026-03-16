export function ChannelTableSkeleton() {
  const rows = Array.from({ length: 10 }, (_, i) => i)

  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="channel-table-skeleton"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-bg-secondary">
            <tr>
              {['Channel', 'Spend', 'Bookings', 'CPB', 'ROAS', 'GMV', ''].map(
                (header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide"
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
                    <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                  </div>
                </td>
                {Array.from({ length: 5 }, (_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" />
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/5 animate-pulse" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
