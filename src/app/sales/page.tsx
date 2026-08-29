"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatCurrencyCents } from "@/lib/format";

interface Lead {
  id: string;
  source: string;
  stage: string;
  valueEstimateCents: number;
  ownerUserId: string;
}

interface Deal {
  id: string;
  stage: string;
}

export default function SalesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [me, setMe] = useState<{ userId: string; role: "owner" | "hr" | "cto" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    source: "inbound-web",
    stage: "new",
    valueEstimateCents: "150000",
    ownerUserId: "owner-1",
  });
  const [winForm, setWinForm] = useState({ dealId: "", clientName: "", managerUserId: "cto-1" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadRows, dealRows, meRow] = await Promise.all([
        authJson<Lead[]>("/api/leads"),
        authJson<Deal[]>("/api/deals"),
        getMeCached(),
      ]);
      setLeads(leadRows);
      setDeals(dealRows);
      setMe(meRow);
      setCreateForm((current) => ({
        ...current,
        ownerUserId: current.ownerUserId === "owner-1" ? meRow.userId : current.ownerUserId,
      }));
      setWinForm((current) => ({
        ...current,
        managerUserId: current.managerUserId === "cto-1" ? meRow.userId : current.managerUserId,
      }));
      setWinForm((current) => (current.dealId || dealRows.length === 0 ? current : { ...current, dealId: dealRows[0].id }));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not load sales records.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Create this lead?")) {
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
      await load();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Lead was not created.");
    }
    setPending(false);
  }

  async function markWon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!winForm.dealId) {
      setError("Select a deal first.");
      return;
    }
    if (!window.confirm("Mark this deal as won and create the project?")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await authJson(`/api/deals/${winForm.dealId}/win`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientName: winForm.clientName, managerUserId: winForm.managerUserId }),
      });
      await load();
      setWinForm((current) => ({ ...current, clientName: "" }));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Deal could not be marked won.");
    }
    setPending(false);
  }

  return (
    <ModuleShell title="Sales Pipeline" description="Track leads and convert won deals directly into delivery projects.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading leads and deals..." /> : null}

      <section className="kpi-grid">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Open leads</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{leads.filter((lead) => lead.stage !== "won" && lead.stage !== "lost").length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Won leads</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{leads.filter((lead) => lead.stage === "won").length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Open deals</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{deals.filter((deal) => deal.stage === "open").length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Pipeline value</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(leads.reduce((sum, lead) => sum + lead.valueEstimateCents, 0))}</p>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <form onSubmit={createLead} className="card grid gap-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">Create lead</h2>
          <p className="text-xs text-muted">Capture source, expected value, and owner in under 30 seconds.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Owner user ID</span>
              <input className="input" value={createForm.ownerUserId} onChange={(e) => setCreateForm({ ...createForm, ownerUserId: e.target.value })} placeholder="owner-1" required />
            </label>
            <label className="field">
              <span className="field-label">Estimated value (cents)</span>
              <input type="number" min={0} className="input num" value={createForm.valueEstimateCents} onChange={(e) => setCreateForm({ ...createForm, valueEstimateCents: e.target.value })} placeholder="150000" required />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Lead source</span>
              <select className="select" value={createForm.source} onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}>
              {"referral,inbound-web,outbound,marketplace,other".split(",").map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Current stage</span>
              <select className="select" value={createForm.stage} onChange={(e) => setCreateForm({ ...createForm, stage: e.target.value })}>
              {"new,qualified,proposal,won,lost".split(",").map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
          </div>
          {me ? <p className="text-xs text-muted">Current signed-in user: {me.userId} ({me.role})</p> : null}
          <button type="submit" disabled={pending} className="btn mt-2">
            {pending ? "Creating lead..." : "Create lead"}
          </button>
        </form>

        <form onSubmit={markWon} className="card grid gap-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">Convert won deal</h2>
          <p className="text-xs text-muted">One action to convert revenue into a staffed delivery project.</p>
          <label className="field">
            <span className="field-label">Open deal</span>
            <select className="select" value={winForm.dealId} onChange={(e) => setWinForm({ ...winForm, dealId: e.target.value })} required>
            <option value="">Select open deal</option>
            {deals.filter((deal) => deal.stage === "open").map((deal) => <option key={deal.id} value={deal.id}>{deal.id}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Client name</span>
            <input className="input" value={winForm.clientName} onChange={(e) => setWinForm({ ...winForm, clientName: e.target.value })} placeholder="Acme Manufacturing" required />
          </label>
          <label className="field">
            <span className="field-label">Project manager user ID</span>
            <input className="input" value={winForm.managerUserId} onChange={(e) => setWinForm({ ...winForm, managerUserId: e.target.value })} placeholder="manager user id" required />
          </label>
          <button type="submit" disabled={pending} className="btn mt-2">
            {pending ? "Converting..." : "Mark won and create project"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold text-ink">Lead register</h2>
        {!loading && leads.length === 0 ? <EmptyState title="No leads yet" guidance="Create the first lead above to start pipeline tracking." /> : null}
        {!loading && leads.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Lead</th><th className="pb-2">Source</th><th className="pb-2">Stage</th><th className="pb-2">Value</th><th className="pb-2">Owner</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="py-2 font-mono text-xs">{lead.id}</td>
                    <td className="py-2">{lead.source}</td>
                    <td className="py-2"><StatusBadge status={lead.stage} /></td>
                    <td className="num py-2">{formatCurrencyCents(lead.valueEstimateCents)}</td>
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
