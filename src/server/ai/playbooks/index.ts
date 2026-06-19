import { playbooks, type Playbook } from "#velite";

/**
 * Playbook registry — the knowledge base the AI agents ground in. Loaded from
 * the Velite `playbooks` collection (content/playbooks/*.md). Deliberately NOT
 * server-only: the Velite output is plain data, so a client surface can offer
 * playbook bodies as copyables too. Mirrors capient's IR playbook registry.
 */

export type { Playbook };
export type PlaybookKind = Playbook["kind"];

const byId = new Map(playbooks.map((p) => [p.id, p]));

export function listPlaybooks(): Playbook[] {
  return playbooks;
}

export function getPlaybook(id: string): Playbook | undefined {
  return byId.get(id);
}

export function playbooksByKind(kind: PlaybookKind): Playbook[] {
  return playbooks.filter((p) => p.kind === kind);
}

/**
 * Compact index (id + title + summary) for a system-prompt capability list, so
 * the model knows which playbooks exist and can fetch one with a readPlaybook
 * tool. Cheap on tokens — bodies are loaded on demand, not all up front.
 */
export function renderPlaybookIndex(list: Playbook[] = playbooks): string {
  return [
    "# Playbooks available (fetch full text with readPlaybook by id)",
    ...list.map((p) => `- ${p.id} — ${p.title}: ${p.summary}`),
  ].join("\n");
}

/**
 * Concatenate playbooks into one prompt-injection block, each fenced with its
 * title + source so the model can attribute claims. Pass a subset to scope it.
 */
export function playbookContextBlock(list: Playbook[] = playbooks): string {
  return list
    .map(
      (p) =>
        `## ${p.title}\nSource: ${p.sourceUrl ?? "internal playbook"}\n\n${p.body}`,
    )
    .join("\n\n---\n\n");
}
