"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
export function Workbooks() {
  const router = useRouter();
  const [brandId, setBrand] = useState("");
  const [name, setName] = useState("Content workbook");
  const [data, setData] = useState("");
  const [kind, setKind] = useState<"csv" | "tsv" | "xlsx">("tsv");
  const [sheet, setSheet] = useState("");
  const [reading, setReading] = useState(false);
  const options = useQuery(
    orpc.contentWorkbook.options.queryOptions({ input: {} }),
  );
  const list = useQuery(orpc.contentWorkbook.list.queryOptions({ input: {} }));
  const create = useMutation(
    orpc.contentWorkbook.import.mutationOptions({
      onSuccess: (r) => router.push(`/app/content/workbooks/${r.id}`),
      onError: (e) => toast.error(e.message),
    }),
  );
  async function upload(file: File) {
    if (file.size > 2_800_000) {
      toast.error("Choose a file smaller than 2.8 MB.");
      return;
    }
    setReading(true);
    try {
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (ext !== "csv" && ext !== "tsv" && ext !== "xlsx")
        throw new Error("Choose a CSV, TSV or XLSX file.");
      setKind(ext);
      setName(file.name);
      if (ext === "xlsx") {
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result.split(",")[1]!)
              : reject(new Error("Could not read file."));
          reader.onerror = () => reject(new Error("Could not read workbook."));
          reader.readAsDataURL(file);
        });
        setData(encoded);
      } else setData(await file.text());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    } finally {
      setReading(false);
    }
  }
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href="/app/content" className="text-sm underline">
        Content
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Content workbooks</h1>
        <p className="mt-2 text-muted-foreground">
          Import a plan, review its rows and apply selected ideas to the content
          calendar as drafts.
        </p>
      </header>
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="font-semibold">Import a workbook</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            Brand
            <SimpleSelect
              aria-label="Brand"
              value={brandId}
              onValueChange={setBrand}
              options={(options.data?.brands ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          CSV, TSV or XLSX file
          <Input
            type="file"
            accept=".csv,.tsv,.xlsx"
            disabled={reading || create.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
        <SimpleSelect
          aria-label="File format"
          value={kind}
          onValueChange={(v) => {
            setKind(v as typeof kind);
            setData("");
          }}
          options={[
            { value: "tsv", label: "Paste TSV" },
            { value: "csv", label: "Paste CSV" },
            { value: "xlsx", label: "Uploaded XLSX" },
          ]}
        />
        {kind === "xlsx" ? (
          <label className="block text-sm">
            Worksheet name (blank selects the first)
            <Input value={sheet} onChange={(e) => setSheet(e.target.value)} />
          </label>
        ) : (
          <Textarea
            aria-label="Workbook text"
            value={data}
            onChange={(e) => setData(e.target.value)}
            rows={8}
            placeholder={
              "Title\tPlatform\tCaption\tDate\nA weekend away\tinstagram\tYour caption\t2026-11-01"
            }
          />
        )}
        <p className="text-sm text-muted-foreground">
          Up to 200 rows. Supported columns: Title, Caption, Platform, Format,
          Date (YYYY-MM-DD), Idea key, Series, Owner, Pillar, Hook, Visual
          direction, CTA, Keyword, KPI and Slot ID. Rows with the same idea key
          share one idea. Each row keeps its own platform caption and date. XLSX
          formulas must be replaced with values.
        </p>
        <Button
          disabled={
            !brandId || !data || !name.trim() || reading || create.isPending
          }
          onClick={() =>
            create.mutate({
              brandId,
              source: { name, kind, data, ...(sheet ? { sheet } : {}) },
            })
          }
        >
          {create.isPending ? "Importing…" : "Import for review"}
        </Button>
      </section>
      {options.error && <p role="alert">{options.error.message}</p>}
      {list.error && <p role="alert">{list.error.message}</p>}
      <section className="space-y-3">
        <h2 className="font-semibold">Saved workbooks</h2>
        {list.data?.map((b) => (
          <Link
            key={b.id}
            className="block rounded-lg border p-4 hover:bg-accent"
            href={`/app/content/workbooks/${b.id}`}
          >
            <span className="font-medium">{b.name}</span>
            <span className="ml-3 text-sm text-muted-foreground">
              {b.appliedAt ? "Applied to drafts" : "Review in progress"}
            </span>
          </Link>
        ))}
        {list.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Your imported plans will appear here.
          </p>
        )}
      </section>
    </main>
  );
}
