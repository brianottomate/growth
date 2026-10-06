const experiment = process.env.DB_EXPERIMENT_BRANCH;
const production = process.env.VERCEL_ENV === "production";
if (experiment && (!experiment.startsWith("experiment/") || production))
  throw new Error(
    "Experiment builds require a disposable branch and a preview deployment.",
  );

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}

// Experiments use db push without committing migration snapshots yet.
if (!experiment) await run(["bun", "run", "db:check"]);
await run(["bun", "run", "typecheck"]);
await run(["bun", "x", "--no-install", "next", "build"]);
if (production) await run(["bun", "run", "db:migrate"]);
