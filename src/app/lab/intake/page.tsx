import Link from "next/link";

import {
  ANSWER_OPTIONS,
  SITE_OPTIONS,
  STAGE_OPTIONS,
  type Scenario,
  parseScenario,
} from "./fixtures";
import { IntakeLab } from "./IntakeLab";

const AXES: {
  key: keyof Scenario;
  label: string;
  options: Record<string, string>;
}[] = [
  { key: "stage", label: "Progress", options: STAGE_OPTIONS },
  { key: "site", label: "Site", options: SITE_OPTIONS },
  { key: "answers", label: "Brand answers", options: ANSWER_OPTIONS },
];

export default async function IntakeLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scenario = parseScenario(await searchParams);

  return (
    <main className="min-h-screen bg-surface-secondary text-primary">
      <header className="space-y-4 px-4 pt-8 pb-4 sm:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Intake form</h1>
          <p className="mt-1 text-sm text-secondary">
            The proposed Performance+ intake, every screen at once: brand
            section sent first, then accounts, then email with its own send.
            Fixture data, read-only.
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {AXES.map((axis) => (
            <div key={axis.key} className="contents">
              <dt className="pt-1 text-xs font-medium text-secondary">
                {axis.label}
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {Object.entries(axis.options).map(([value, label]) => {
                  const active = scenario[axis.key] === value;
                  const params = new URLSearchParams({
                    ...scenario,
                    [axis.key]: value,
                  });
                  return (
                    <Link
                      key={value}
                      href={`?${params}`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? "border-primary bg-primary text-surface-primary"
                          : "border-border-secondary hover:border-primary"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </dd>
            </div>
          ))}
        </dl>
      </header>
      <IntakeLab scenario={scenario} />
    </main>
  );
}
