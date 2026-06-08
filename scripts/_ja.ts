import { writeFileSync } from "node:fs";

type Rec = {
  id?: string;
  error?: unknown;
  snapshot_id?: string;
  post_type?: string;
  repost?: { repost_user_id?: string; repost_id?: string };
};
type Progress = { status?: string };

const TOKEN = process.env.BRIGHT_DATA_API_KEY!;
const BASE = "https://api.brightdata.com/datasets/v3";
const DS = "gd_lyy3tktm25m4avu764";
const url = "https://www.linkedin.com/in/jaentwistle/";
const qs = new URLSearchParams({ dataset_id: DS, type: "discover_new", discover_by: "profile_url", notify: "false", include_errors: "true", limit_per_input: "30" });
const res = await fetch(`${BASE}/scrape?${qs}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: [{ url }] }) });
let recs: Rec[]; const text = await res.text();
try { const p = JSON.parse(text) as Rec | Rec[]; recs = Array.isArray(p) ? p : [p]; } catch { recs = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Rec); }
const snap = recs[0]?.snapshot_id;
if (snap) { for (let i=0;i<80;i++){ const pr = await fetch(`${BASE}/progress/${snap}`,{headers:{Authorization:`Bearer ${TOKEN}`}}).then((r)=>r.json()) as Progress; if(pr.status==="ready")break; if(pr.status==="failed"){console.log("FAILED");process.exit(1);} await new Promise((r)=>setTimeout(r,5000)); }
  const t = await fetch(`${BASE}/snapshot/${snap}?format=json`,{headers:{Authorization:`Bearer ${TOKEN}`}}).then((r)=>r.text());
  try { recs = JSON.parse(t) as Rec[]; } catch { recs = t.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Rec); } }
writeFileSync("scripts/.brightdata-ja.json", JSON.stringify(recs, null, 2));
const real = recs.filter((r)=>r.id && !r.error);
console.log(`Total ${recs.length}, real ${real.length}`);
const types: Record<string,number> = {}; for (const r of real) types[r.post_type??"?"]=(types[r.post_type??"?"]??0)+1;
console.log("post_type:", types);
console.log("reposts of:");
for (const r of real.filter((r)=>r.post_type==="repost")) console.log(`  @${r.repost?.repost_user_id ?? "?"}  (original id ${r.repost?.repost_id ?? "?"})`);
process.exit(0);
