interface Stat {
  label: string;
  value: string;
  change?: string;
}

interface StatsProps {
  stats: Stat[];
  title?: string;
}

export function Stats({ stats, title }: StatsProps) {
  return (
    <div className="my-8">
      {title && (
        <h3 className="mb-6 text-center text-lg font-semibold text-primary">
          {title}
        </h3>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="rounded-lg border border-secondary bg-surface-secondary p-6 shadow-sm"
          >
            <div className="text-3xl font-bold text-amber-600">
              {stat.value}
            </div>
            <div className="mt-1 text-sm font-medium text-primary">
              {stat.label}
            </div>
            {stat.change && (
              <div className="mt-2 text-sm text-green-500">{stat.change}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
