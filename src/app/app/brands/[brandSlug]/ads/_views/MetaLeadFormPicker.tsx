"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  META_LEAD_FORM_TEMPLATE_LABELS,
  META_LEAD_FORM_TEMPLATES,
  type MetaLeadFormTemplate,
} from "@/lib/meta-lead-forms";
import { orpc } from "@/orpc/client";

/**
 * The instant form a lead generation ad set points at: one of the active
 * forms on the Page the brand's ads run as, or a new one from a house
 * template. Meta owns the form; this only chooses its id.
 */
export function MetaLeadFormPicker({
  brandSlug,
  value,
  onChange,
}: {
  brandSlug: string;
  value: string;
  onChange: (leadFormId: string) => void;
}) {
  const queryClient = useQueryClient();
  const forms = useQuery(
    orpc.ads.leadForms.queryOptions({ input: { brandSlug } }),
  );
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<MetaLeadFormTemplate>(
    META_LEAD_FORM_TEMPLATES[0],
  );
  const [name, setName] = useState("");
  const create = useMutation(
    orpc.ads.createLeadForm.mutationOptions({
      onSuccess: async (result) => {
        onChange(result.form.id);
        setCreating(false);
        setName("");
        await queryClient.invalidateQueries({
          queryKey: orpc.ads.leadForms.key({ input: { brandSlug } }),
        });
      },
    }),
  );
  const rows = forms.data?.forms ?? [];
  const chosen = rows.find((form) => form.id === value);

  return (
    <div className="space-y-2 text-sm @xl:col-span-2">
      <label className="space-y-1">
        Lead form
        <Select
          value={value}
          onValueChange={onChange}
          disabled={forms.isPending || rows.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                forms.isPending
                  ? "Loading the Page's forms…"
                  : rows.length
                    ? "Choose a form"
                    : "No active forms on this Page yet"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {rows.map((form) => (
              <SelectItem key={form.id} value={form.id}>
                {form.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {chosen && (
        <p className="text-xs text-muted-foreground">
          {chosen.questions.map((question) => question.label).join(" · ")}
        </p>
      )}
      {forms.error && <p role="alert">{forms.error.message}</p>}
      {creating ? (
        <div className="grid grid-cols-1 gap-2 rounded-md border p-3 @xl:grid-cols-2">
          <label className="space-y-1">
            Template
            <Select
              value={template}
              onValueChange={(next) =>
                setTemplate(next as MetaLeadFormTemplate)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {META_LEAD_FORM_TEMPLATES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {META_LEAD_FORM_TEMPLATE_LABELS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            Name (optional)
            <Input
              value={name}
              placeholder="Template name with this month"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground @xl:col-span-2">
            {META_LEAD_FORM_TEMPLATE_LABELS[template].summary} Meta cannot edit
            a form afterwards; a change is a new form.
          </p>
          {create.error && (
            <p role="alert" className="@xl:col-span-2">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2 @xl:col-span-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={create.isPending}
              onClick={() =>
                create.mutate({
                  brandSlug,
                  template,
                  ...(name.trim() ? { name: name.trim() } : {}),
                })
              }
            >
              Create on the Page
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          Create a form from a template
        </Button>
      )}
    </div>
  );
}
