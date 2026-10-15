"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { orpc } from "@/orpc/client";
import {
  AssigneeButton,
  OwnerAvatar,
  type Member,
} from "@/components/assignment/assignee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@wandercom/design-system-web/ui/accordion";
import { toast } from "@/components/ui/toast";
import { SimpleSelect } from "@/components/ui/select";
import { Combobox } from "@/components/ui/compound/combobox";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_TAG_SUGGESTIONS,
  taskSettled,
  type TaskCategory,
  type TaskStatus,
} from "@/lib/brand-task";
import type { BrandTaskView } from "@/server/services/brand-task.service";

const categoryOptions = Object.entries(TASK_CATEGORIES).map(
  ([value, label]) => ({ value, label }),
);
const statusOptions = Object.entries(TASK_STATUSES).map(([value, label]) => ({
  value,
  label,
}));
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function BrandTasks({ brandId }: { brandId: string }) {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(
    orpc.brandTask.list.queryOptions({ input: { brandId } }),
  );
  const roster = useQuery(orpc.performance.staffRoster.queryOptions());
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("setup");
  const [filter, setFilter] = useState("open");
  const [tag, setTag] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.brandTask.list.key({ input: { brandId } }),
    });
  const create = useMutation(
    orpc.brandTask.create.mutationOptions({
      onSuccess: async () => {
        setTitle("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const restore = useMutation(
    orpc.brandTask.restore.mutationOptions({
      onSuccess: () => refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    orpc.brandTask.remove.mutationOptions({
      onSuccess: async (_result, input) => {
        await refresh();
        toast.success("Task removed", {
          action: { label: "Undo", onClick: () => restore.mutate(input) },
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const tasks = tasksQuery.data ?? [];
  const settled = tasks.filter((task) => taskSettled(task.status)).length;
  const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort();
  const currentUserId = roster.data?.currentUserId ?? "";
  const visible = tasks.filter((task) => {
    if (tag && !task.tags.includes(tag)) return false;
    if (filter === "open") return !taskSettled(task.status);
    if (filter === "mine")
      return task.assigneeUserId === currentUserId && !taskSettled(task.status);
    if (filter === "overdue")
      return (
        !!task.dueDate && task.dueDate < localDay() && !taskSettled(task.status)
      );
    return true;
  });

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      aria-labelledby={`tasks-${brandId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`tasks-${brandId}`} className="text-base font-semibold">
          Client tasks{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {settled}/{tasks.length} settled
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <SimpleSelect
            size="sm"
            className="w-40"
            aria-label="Filter tasks"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "open", label: "Open tasks" },
              { value: "all", label: "All tasks" },
              { value: "mine", label: "Assigned to me" },
              { value: "overdue", label: "Overdue" },
            ]}
          />
          <Combobox
            size="sm"
            className="w-40"
            align="end"
            ariaLabel="Filter by tag"
            placeholder="All tags"
            searchPlaceholder="Search tags…"
            emptyText="No matching tags."
            value={tag}
            onValueChange={setTag}
            options={[
              { value: "", label: "All tags" },
              ...[...new Set([...tags, ...(tag ? [tag] : [])])].map(
                (value) => ({ value, label: value }),
              ),
            ]}
          />
        </div>
      </div>
      {tasksQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : tasksQuery.isError ? (
        <div role="alert" className="text-sm">
          {tasksQuery.error.message}{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void tasksQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          {Object.entries(TASK_CATEGORIES).map(([key, label]) => {
            const group = visible.filter((task) => task.category === key);
            if (!group.length) return null;
            const ordered = tasks.filter((task) => task.category === key);
            return (
              <div key={key} className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {label}
                </h3>
                <ul className="divide-y">
                  {group.map((task) => {
                    const index = ordered.findIndex(
                      (row) => row.id === task.id,
                    );
                    return (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onRemove={() => remove.mutate({ brandId, id: task.id })}
                        removing={
                          remove.isPending && remove.variables?.id === task.id
                        }
                        members={roster.data?.members ?? []}
                        currentUserId={currentUserId}
                        refresh={refresh}
                        previousId={ordered[index - 1]?.id ?? null}
                        nextId={ordered[index + 1]?.id ?? null}
                        afterNextId={ordered[index + 2]?.id ?? null}
                      />
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!visible.length && (
            <p className="text-sm text-muted-foreground">
              {tasks.length
                ? "No tasks match this view."
                : "Add the first task for this brand."}
            </p>
          )}
        </>
      )}
      {roster.isError && (
        <p role="alert" className="text-sm">
          Could not load the team.{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void roster.refetch()}
          >
            Retry
          </Button>
        </p>
      )}
      <form
        className="flex flex-wrap items-center gap-2 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim())
            create.mutate({
              brandId,
              title,
              category,
              notes: null,
              tags: [],
              status: "todo",
              assigneeUserId: null,
              dueDate: null,
            });
        }}
      >
        <Input
          aria-label="New task"
          placeholder="Add a task…"
          value={title}
          maxLength={300}
          onChange={(event) => setTitle(event.target.value)}
          className="min-w-40 flex-1"
          disabled={create.isPending}
        />
        <SimpleSelect
          size="sm"
          value={category}
          aria-label="New task category"
          onValueChange={(value) => setCategory(value as TaskCategory)}
          options={categoryOptions}
        />
        <Button
          type="submit"
          size="sm"
          disabled={create.isPending || !title.trim() || tasksQuery.isError}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </form>
    </section>
  );
}

function TaskRow({
  task,
  onRemove,
  removing,
  members,
  currentUserId,
  refresh,
  previousId,
  nextId,
  afterNextId,
}: {
  task: BrandTaskView;
  onRemove: () => void;
  removing: boolean;
  members: Member[];
  currentUserId: string;
  refresh: () => Promise<unknown>;
  previousId: string | null;
  nextId: string | null;
  afterNextId: string | null;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [tags, setTags] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const titleValue = title ?? task.title;
  const notesValue = notes ?? task.notes ?? "";
  const tagsValue = tags ?? task.tags.join(", ");
  const update = useMutation(
    orpc.brandTask.update.mutationOptions({
      scope: { id: task.id },
      onSuccess: () => refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const move = useMutation(
    orpc.brandTask.move.mutationOptions({
      onSuccess: () => refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const save = (
    patch: Parameters<typeof update.mutate>[0]["patch"],
    onSuccess?: () => void,
  ) =>
    update.mutate({ brandId: task.brandId, id: task.id, patch }, { onSuccess });
  const overdue =
    task.dueDate && task.dueDate < localDay() && !taskSettled(task.status);
  const assigned = task.assignee ?? null;
  const inactiveAssignee =
    assigned && !members.some((person) => person.id === assigned.id);

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          aria-label={`Complete ${task.title}`}
          checked={task.status === "done"}
          disabled={update.isPending}
          onCheckedChange={(checked) =>
            save({ status: checked === true ? "done" : "todo" })
          }
        />
        <Input
          appearance="inline"
          aria-label="Task title"
          value={titleValue}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={300}
          onBlur={() => {
            if (title === null) return;
            if (!title.trim()) {
              toast.error("A task needs a title");
              return;
            }
            const submitted = title;
            save({ title: submitted }, () =>
              setTitle((current) => (current === submitted ? null : current)),
            );
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 min-w-40 flex-1"
        />
        <SimpleSelect
          size="sm"
          className="w-32"
          aria-label={`Status for ${task.title}`}
          value={task.status}
          onValueChange={(value) => save({ status: value as TaskStatus })}
          disabled={update.isPending}
          options={statusOptions}
        />
        <span
          title={
            inactiveAssignee
              ? "This person is no longer on the team. Reassign or clear."
              : undefined
          }
        >
          <AssigneeButton
            value={assigned}
            members={members}
            currentUserId={currentUserId}
            onChange={(assigneeUserId) => save({ assigneeUserId })}
            label="Assign task"
            clearLabel="Unassign task"
          />
        </span>
        <Input
          type="date"
          aria-label={`Due date for ${task.title}`}
          value={dueDate ?? task.dueDate ?? ""}
          onInput={(event) => setDueDate(event.currentTarget.value)}
          onBlur={(event) => {
            const submitted = event.currentTarget.value;
            save({ dueDate: submitted || null }, () =>
              setDueDate((current) => (current === submitted ? null : current)),
            );
          }}
          className="h-8 w-36"
          textSize="xs"
          tone={overdue ? "error" : undefined}
          disabled={update.isPending}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 pl-7">
        {!!task.tags.length && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map((value, index) => (
              <span
                key={`${value}-${index}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {value}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.creator && <OwnerAvatar member={task.creator} size="sm" />}
          <span>
            Created by{" "}
            {task.creator?.name ??
              (task.templateKey ? "Default checklist" : "Former teammate")}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(task.createdAt).toISOString()}>
            {new Date(task.createdAt).toLocaleDateString()}
          </time>
        </div>
      </div>
      <AccordionRoot className="mt-1 pl-7">
        <AccordionItem value="details">
          <AccordionTrigger
            className="py-2"
            aria-label={`Details for ${task.title}`}
          >
            <span className="text-xs text-muted-foreground">Details</span>
          </AccordionTrigger>
          <AccordionPanel>
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              {overdue && (
                <p className="text-xs font-medium">This task is overdue.</p>
              )}
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Category
                  </span>
                  <SimpleSelect
                    size="sm"
                    className="w-full"
                    aria-label={`Category for ${task.title}`}
                    value={task.category}
                    onValueChange={(value) =>
                      save({ category: value as TaskCategory })
                    }
                    disabled={update.isPending}
                    options={categoryOptions}
                  />
                </div>
              </div>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const submittedNotes = notesValue;
                  const submittedTags = tagsValue;
                  save(
                    {
                      notes: submittedNotes || null,
                      tags: submittedTags
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    },
                    () => {
                      setNotes((current) =>
                        current === submittedNotes ? null : current,
                      );
                      setTags((current) =>
                        current === submittedTags ? null : current,
                      );
                    },
                  );
                }}
              >
                <div className="space-y-2">
                  <Label
                    htmlFor={`task-notes-${task.id}`}
                    textSize="xs"
                    tone="muted"
                  >
                    Notes
                  </Label>
                  <Textarea
                    id={`task-notes-${task.id}`}
                    rows={3}
                    aria-label={`Notes for ${task.title}`}
                    placeholder="Notes, links, context…"
                    value={notesValue}
                    maxLength={10000}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor={`task-tags-${task.id}`}
                    textSize="xs"
                    tone="muted"
                  >
                    Tags
                  </Label>
                  <Input
                    id={`task-tags-${task.id}`}
                    aria-label={`Tags for ${task.title}`}
                    placeholder="Tags, separated by commas"
                    value={tagsValue}
                    onChange={(event) => setTags(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-1">
                    {TASK_TAG_SUGGESTIONS.filter(
                      (value) =>
                        !tagsValue
                          .split(",")
                          .some((tag) => tag.trim().toLowerCase() === value),
                    )
                      .slice(0, 6)
                      .map((value) => (
                        <button
                          type="button"
                          key={value}
                          className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                          onClick={() =>
                            setTags((current) =>
                              (current ?? tagsValue).trim()
                                ? `${current ?? tagsValue}, ${value}`
                                : value,
                            )
                          }
                        >
                          + {value}
                        </button>
                      ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                >
                  Save details
                </Button>
              </form>
              {task.completedAt && (
                <p className="text-xs text-muted-foreground">
                  Completed by {task.completedBy?.name ?? "Former teammate"} ·{" "}
                  {new Date(task.completedAt).toLocaleDateString()}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${task.title} up`}
                  disabled={!previousId || move.isPending}
                  onClick={() =>
                    move.mutate({
                      brandId: task.brandId,
                      id: task.id,
                      beforeId: previousId,
                    })
                  }
                >
                  <ArrowUp className="size-3.5" />
                  Up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${task.title} down`}
                  disabled={!nextId || move.isPending}
                  onClick={() =>
                    move.mutate({
                      brandId: task.brandId,
                      id: task.id,
                      beforeId: afterNextId,
                    })
                  }
                >
                  <ArrowDown className="size-3.5" />
                  Down
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removing}
                  onClick={onRemove}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
              {update.isError && (
                <p role="alert" className="text-xs">
                  {update.error.message} Your text is still here; edit or save
                  again to retry.
                </p>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </AccordionRoot>
    </li>
  );
}
