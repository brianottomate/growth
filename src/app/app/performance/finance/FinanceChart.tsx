"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { monthLabel, type FinanceMonth } from "@/lib/performance-finance";

const config = {
  paying: { label: "Paying", color: "var(--color-success)" },
  signed: { label: "Signed", color: "var(--color-primary)" },
} satisfies ChartConfig;

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const short = (value: number) =>
  value >= 1000 ? `$${Math.round(value / 1000)}k` : dollars.format(value);

/**
 * Monthly fees as annual run rate: the solid line is what is paying, the
 * dashed line is what is signed, and the months past today are the
 * projection from recorded start and end dates.
 */
export function FinanceChart({ months }: { months: FinanceMonth[] }) {
  const data = months.map((month) => ({
    month: monthLabel(month.month),
    paying: month.future ? null : month.actualFees * 12,
    signed: month.committedFees * 12,
  }));
  const today = months.find((month, index) => months[index + 1]?.future);
  return (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="text-[13px] font-semibold">
        Fee run rate
      </figcaption>
      <ChartContainer config={config} className="mt-3 h-56 w-full">
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => short(value)}
          />
          {today ? (
            <ReferenceLine
              x={monthLabel(today.month)}
              stroke="var(--color-border)"
              strokeDasharray="3 3"
            />
          ) : null}
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config].label}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {dollars.format(Number(value))}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Line
            dataKey="signed"
            type="linear"
            stroke="var(--color-signed)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            dataKey="paying"
            type="linear"
            stroke="var(--color-paying)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </figure>
  );
}
