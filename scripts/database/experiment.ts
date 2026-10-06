import { resolve } from "node:path";

// Credentials stay in child-process env; the normal .env is never rewritten.
const [action, name, ...args] = process.argv.slice(2);
if (!name || !["dev", "push", "preview", "delete"].includes(action ?? "")) {
  console.log(
    "Usage: bun run scripts/database/experiment.ts <dev|push|preview|delete> <name> [-- command...]",
  );
  process.exit(name ? 1 : 0);
}
// This is Growth's existing project, verified against the normal production URL.
const project = process.env.NEON_PROJECT_ID ?? "lingering-river-02200892";
const parent = process.env.NEON_PRODUCTION_BRANCH ?? "production";
const branchName = `experiment/${name}`;
const neon = [
  "bun",
  "x",
  "--no-install",
  "neon",
  "--project-id",
  project,
  "--no-analytics",
];

async function capture(command: string[]) {
  const child = Bun.spawn(command, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(error || "Neon command failed");
  return output.trim();
}

type Branch = {
  id: string;
  name: string;
  parent_id?: string;
  default?: boolean;
  protected?: boolean;
};
const branches = JSON.parse(
  await capture([...neon, "branches", "list", "-o", "json"]),
) as Branch[];
const production = branches.find(
  (branch) => branch.id === parent || branch.name === parent,
);
if (!production)
  throw new Error(
    "NEON_PRODUCTION_BRANCH does not identify a branch in this project.",
  );
let branch = branches.find((item) => item.name === branchName);
if (!branch && action === "delete")
  throw new Error("Experiment branch does not exist.");
if (!branch) {
  const created = JSON.parse(
    await capture([
      ...neon,
      "branches",
      "create",
      "--name",
      branchName,
      "--parent",
      production.id,
      "--expires-at",
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      "--no-secrets",
      "-o",
      "json",
    ]),
  ) as { branch: Branch };
  branch = created.branch;
}
if (
  branch.id === production.id ||
  branch.default ||
  branch.protected ||
  branch.parent_id !== production.id
)
  throw new Error(
    "Only disposable experiment branches directly under the configured production branch are supported.",
  );
console.log(
  `Using Neon ${branchName}. Production connection files are unchanged.`,
);
if (action === "delete") {
  await capture([...neon, "branches", "delete", branch.id, "-o", "json"]);
  process.exit(0);
}

if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL must identify Growth's usual database and role.",
  );
const source = new URL(process.env.DATABASE_URL);
const connectionArgs = [
  ...neon,
  "connection-string",
  branch.id,
  "--role-name",
  decodeURIComponent(source.username),
  "--database-name",
  decodeURIComponent(source.pathname.slice(1)),
];
const direct = await capture(connectionArgs);
const pooled = await capture([...connectionArgs, "--pooled"]);
const databaseEnv = {
  DATABASE_URL: pooled,
  DATABASE_URL_DIRECT: direct,
  DATABASE_URL_UNPOOLED: direct,
  DB_EXPERIMENT_BRANCH: branchName,
};

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    env: { ...process.env, ...databaseEnv },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}

if (action === "push" || action === "preview")
  await run(["bun", "x", "--no-install", "drizzle-kit", "push", "--force"]);
if (action === "dev")
  await run(
    args.length
      ? args[0] === "--"
        ? args.slice(1)
        : args
      : ["bun", "run", "dev"],
  );
if (action === "preview") {
  // Overrides must reach both compilation and deployed functions, not project settings.
  const overrides = Object.entries(databaseEnv).flatMap(([key, value]) => [
    "--env",
    `${key}=${value}`,
    "--build-env",
    `${key}=${value}`,
  ]);
  await run([
    "vercel",
    "deploy",
    "--yes",
    "--target",
    "preview",
    "--scope",
    "wanderdev",
    "--project",
    "growth",
    ...overrides,
    "--local-config",
    resolve("vercel.json"),
  ]);
}
