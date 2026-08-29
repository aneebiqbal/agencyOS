"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authJson } from "@/lib/client-api";

interface Lead {
  id: string;
  source: string;
  stage: string;
  valueEstimateCents: number;
  ownerUserId: string;
}

interface Deal {
  id: string;
  leadId: string;
  stage: string;
}

export default function SalesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [createForm, setCreateForm] = useState({
    source: "inbound-web",
    stage: "new",
    valueEstimateCents: "150000",
    ownerUserId: "owner-1",
  });
  const [winForm, setWinForm] = useState({
    dealId: "",
    clientName: "",
    managerUserId: "cto-1",
  });

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadRows, dealRows] = await Promise.all([
        authJson<Lead[]>("/api/leads"),
        authJson<Deal[]>("/api/deals"),
      ]);
      setLeads(leadRows);
      setDeals(dealRows);
      setWinForm((current) =>
        current.dealId || dealRows.length === 0 ? current : { ...current, dealId: dealRows[0].id },
      );
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load sales pipeline data.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshData();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshData]);

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm("Create this lead record?");
    if (!shouldContinue) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await authJson("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: createForm.source,
          stage: createForm.stage,
          valueEstimateCents: Number(createForm.valueEstimateCents),
          ownerUserId: createForm.ownerUserId,
        }),
      });
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Lead creation failed.");
    }
    setPending(false);
  }

  async function markWon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!winForm.dealId) {
      setError("No deal available to mark won.");
      return;
    }
    const shouldContinue = window.confirm("Mark selected deal as won and create project?");
    if (!shouldContinue) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await authJson(`/api/deals/${winForm.dealId}/win`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName: winForm.clientName,
          managerUserId: winForm.managerUserId,
        }),
      });
      setWinForm((current) => ({ ...current, clientName: "" }));
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Deal win action failed.");
    }
    setPending(false);
  }

  return (
    <ModuleShell
      title="Sales Pipeline"
      description="Lead intake, open-deal visibility, and won-deal to project conversion."
      endpoints={["GET /api/leads", "POST /api/leads", "GET /api/deals", "POST /api/deals/:dealId/win"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={createLead} className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Create lead</h3>
          <div className="mt-3 grid gap-3 text-sm">
            <input
              className="rounded border border-border px-3 py-2"
              placeholder="Owner user id"
              value={createForm.ownerUserId}
              onChange={(event) => setCreateForm({ ...createForm, ownerUserId: event.target.value })}
              required
            />
            <select
              className="rounded border border-border px-3 py-2"
              value={createForm.source}
              onChange={(event) => setCreateForm({ ...createForm, source: event.target.value })}
            >
              {"referral,inbound-web,outbound,marketplace,other".split(",").map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-border px-3 py-2"
              value={createForm.stage}
              onChange={(event) => setCreateForm({ ...createForm, stage: event.target.value })}
            >
              {"new,qualified,proposal,won,lost".split(",").map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className="rounded border border-border px-3 py-2"
              placeholder="Value estimate (cents)"
              value={createForm.valueEstimateCents}
              onChange={(event) => setCreateForm({ ...createForm, valueEstimateCents: event.target.value })}
              required
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving..." : "Create lead"}
          </button>
        </form>

        <form onSubmit={markWon} className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Mark deal won</h3>
          <div className="mt-3 grid gap-3 text-sm">
            <select
              className="rounded border border-border px-3 py-2"
              value={winForm.dealId}
              onChange={(event) => setWinForm({ ...winForm, dealId: event.target.value })}
              required
            >
              <option value="">Select deal</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.id} ({deal.stage})
                </option>
              ))}
            </select>
            <input
              className="rounded border border-border px-3 py-2"
              placeholder="Client name"
              value={winForm.clientName}
              onChange={(event) => setWinForm({ ...winForm, clientName: event.target.value })}
              required
            />
            <input
              className="rounded border border-border px-3 py-2"
              placeholder="Manager user id"
              value={winForm.managerUserId}
              onChange={(event) => setWinForm({ ...winForm, managerUserId: event.target.value })}
              required
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Applying..." : "Mark won + create project"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Leads</h3>
        {loading ? <p className="mt-3 text-sm text-zinc-600">Loading leads...</p> : null}
        {!loading && leads.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No leads yet.</p> : null}
        {!loading && leads.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-zinc-600">
                  <th className="pb-2">Lead</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Stage</th>
                  <th className="pb-2">Value (cents)</th>
                  <th className="pb-2">Owner</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border/60">
                    <td className="py-2 font-mono text-xs">{lead.id}</td>
                    <td className="py-2">{lead.source}</td>
                    <td className="py-2">{lead.stage}</td>
                    <td className="py-2">{lead.valueEstimateCents}</td>
                    <td className="py-2">{lead.ownerUserId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ModuleShell>
  );
}
