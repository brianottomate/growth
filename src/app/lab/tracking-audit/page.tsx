"use client";

import { useMemo, useState } from "react";
import {
  ALL_EVENTS,
  SURFACES,
  WORKSPACES,
  type Surface,
  type TrackedEvent,
  type Workspace,
} from "@/data/tracking-audit";

const WORKSPACE_COLORS: Record<Workspace, string> = {
  marketplace: "bg-blue-50 text-blue-700 border-blue-200",
  os: "bg-purple-50 text-purple-700 border-purple-200",
  marketing: "bg-green-50 text-green-700 border-green-200",
};

const SURFACE_LABELS: Record<Surface, string> = {
  "wander.com": "wander.com",
  "app.wander.com": "app.wander.com",
  mobile: "mobile",
  backend: "backend",
};

export default function TrackingAuditPage() {
  const [workspaceFilter, setWorkspaceFilter] = useState<Workspace | "all">("all");
  const [surfaceFilter, setSurfaceFilter] = useState<Surface | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return ALL_EVENTS.filter((e) => {
      if (workspaceFilter !== "all" && e.workspace !== workspaceFilter) return false;
      if (surfaceFilter !== "all" && !e.surfaces.includes(surfaceFilter)) return false;
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [workspaceFilter, surfaceFilter, query]);

  const counts = useMemo(() => {
    const bySurface: Record<Surface, number> = {
      "wander.com": 0,
      "app.wander.com": 0,
      mobile: 0,
      backend: 0,
    };
    for (const e of ALL_EVENTS) {
      for (const s of e.surfaces) bySurface[s]++;
    }
    return bySurface;
  }, []);

  return (
    <div className="min-h-screen bg-white p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Tracking plan audit</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mirrored from <code>tracking/packages/core</code>. {ALL_EVENTS.length} events across {SURFACES.length} surfaces.
        </p>
      </header>

      {/* Surface tallies */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SURFACES.map((s) => (
          <div key={s} className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">{SURFACE_LABELS[s]}</div>
            <div className="text-xl font-semibold tabular-nums text-gray-900">{counts[s]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter events…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value as Workspace | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All workspaces</option>
          {WORKSPACES.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <select
          value={surfaceFilter}
          onChange={(e) => setSurfaceFilter(e.target.value as Surface | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All surfaces</option>
          {SURFACES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} / {ALL_EVENTS.length} events</span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700">Event</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Workspace</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Category</th>
              {SURFACES.map((s) => (
                <th key={s} className="px-3 py-2 text-center font-medium text-gray-700">{SURFACE_LABELS[s]}</th>
              ))}
              <th className="px-3 py-2 text-left font-medium text-gray-700">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.map((event) => (
              <EventRow key={`${event.workspace}-${event.name}`} event={event} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: TrackedEvent }) {
  const clientParity =
    event.surfaces.includes("wander.com") && event.surfaces.includes("mobile");

  return (
    <tr className="hover:bg-gray-50">
      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs text-gray-900">{event.name}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${WORKSPACE_COLORS[event.workspace]}`}>
          {event.workspace}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">{event.category}</td>
      {SURFACES.map((s) => {
        const fires = event.surfaces.includes(s);
        const isClientCol = s === "wander.com" || s === "mobile";
        const bg = clientParity && isClientCol ? "bg-blue-50" : "";
        return (
          <td key={s} className={`px-3 py-2 text-center ${bg}`}>
            {fires ? (
              <span className={clientParity && isClientCol ? "text-blue-600" : "text-green-600"}>●</span>
            ) : (
              <span className="text-gray-200">○</span>
            )}
          </td>
        );
      })}
      <td className="px-3 py-2 text-xs text-gray-500">{event.notes ?? ""}</td>
    </tr>
  );
}
