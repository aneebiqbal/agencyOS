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
  leadId?: string;
  valueCents?: number;
}

interface DealRecord {
  id: string;
}

interface CoreUser {
  userId: string;
  role: "owner" | "hr" | "cto";
  fullName: string;
}

const LEAD_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "upwork", label: "Upwork" },
  { value: "gmail", label: "Gmail" },
  { value: "referral", label: "Referral" },
  { value: "inbound-web", label: "Inbound Website" },
  { value: "outbound", label: "Outbound" },
  { value: "marketplace", label: "Marketplace" },
  { value: "other", label: "Other" },
];

const STAGE_UPDATE_OPTIONS = ["new", "qualified", "proposal", "lost"] as const;
const CREATE_STAGE_OPTIONS = ["new", "qualified", "proposal", "lost"] as const;

function formatStageLabel(stage: string) {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export default function SalesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [coreUsers, setCoreUsers] = useState<CoreUser[]>([]);
  const [me, setMe] = useState<{ userId: string; role: "owner" | "hr" | "cto" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    source: "linkedin",
    stage: "new",
    valueEstimateCents: "150000",
    ownerUserId: "owner-1",
  });
  const [winForm, setWinForm] = useState({ dealId: "", clientName: "", managerUserId: "cto-1" });
  const [leadStageForm, setLeadStageForm] = useState({ leadId: "", stage: "qualified" });

  const openDeals = deals.filter((deal) => deal.stage === "open");
  const leadIdsWithDeal = new Set(deals.map((deal) => deal.leadId).filter(Boolean));
  const dealReadyLeads = leads.filter((lead) => lead.stage !== "won" && !leadIdsWithDeal.has(lead.id));
  const canConvertOptions = openDeals.length > 0 || dealReadyLeads.length > 0;
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const userById = new Map(coreUsers.map((user) => [user.userId, user]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadRows, dealRows, meRow] = await Promise.all([
        authJson<Lead[]>("/api/leads"),
        authJson<Deal[]>("/api/deals"),
        getMeCached(),
      ]);
      const users = await authJson<CoreUser[]>("/api/core-users");
      setLeads(leadRows);
      setDeals(dealRows);
      setCoreUsers(users);
      setMe(meRow);
      setCreateForm((current) => ({
        ...current,
        ownerUserId: current.ownerUserId === "owner-1" ? meRow.userId : current.ownerUserId || users[0]?.userId || meRow.userId,
      }));
      setWinForm((current) => ({
        ...current,
        managerUserId: current.managerUserId === "cto-1" ? meRow.userId : current.managerUserId || meRow.userId,
      }));
      const firstOpenDeal = dealRows.find((deal) => deal.stage === "open");
      const leadIdsWithAnyDeal = new Set(dealRows.map((deal) => deal.leadId).filter(Boolean));
      const firstDealReadyLead = leadRows.find((lead) => lead.stage !== "won" && !leadIdsWithAnyDeal.has(lead.id));
      setWinForm((current) => {
        if (current.dealId) {
          return current;
        }
        if (firstOpenDeal) {
          return { ...current, dealId: firstOpenDeal.id };
        }
        if (firstDealReadyLead) {
          return { ...current, dealId: `lead:${firstDealReadyLead.id}` };
        }
        return current;
      });
      setLeadStageForm((current) => {
        const selectedLead = leadRows.find((lead) => lead.id === current.leadId);
        if (selectedLead) {
          if (selectedLead.stage === "won") {
            return { leadId: selectedLead.id, stage: "proposal" };
          }
          return current;
        }
        const fallbackLead = leadRows.find((lead) => lead.stage !== "won") ?? leadRows[0];
        if (!fallbackLead) {
          return { leadId: "", stage: "qualified" };
        }
        const fallbackStage = fallbackLead.stage === "won" ? "proposal" : fallbackLead.stage;
        return { leadId: fallbackLead.id, stage: fallbackStage };
      });
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
      let dealId = winForm.dealId;
      if (dealId.startsWith("lead:")) {
        const leadId = dealId.slice("lead:".length);
        const createdDeal = await authJson<DealRecord>(`/api/leads/${encodeURIComponent(leadId)}/deal`, {
          method: "POST",
        });
        dealId = createdDeal.id;
      }

      await authJson(`/api/deals/${dealId}/win`, {
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

  async function updateLeadStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadStageForm.leadId) {
      setError("Select a lead first.");
      return;
    }
    const selectedLead = leads.find((lead) => lead.id === leadStageForm.leadId);
    if (selectedLead?.stage === "won") {
      setError("This lead is already won. Use the deal conversion flow for won outcomes.");
      return;
    }

    if (!window.confirm(`Update lead ${leadStageForm.leadId} to ${formatStageLabel(leadStageForm.stage)}?`)) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await authJson(`/api/leads/${encodeURIComponent(leadStageForm.leadId)}/stage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: leadStageForm.stage }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Lead status could not be updated.");
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
          <h2 className="text-sm font-semibold text-ink">Capture new lead</h2>
          <p className="text-xs text-muted">Add ownership, source, and estimated value so the pipeline is immediately actionable.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Lead owner</span>
              <select
                className="select"
                value={createForm.ownerUserId}
                onChange={(e) => setCreateForm({ ...createForm, ownerUserId: e.target.value })}
                required
              >
                <option value="">Select owner</option>
                {coreUsers.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.fullName} - {user.role} ({user.userId})
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Use a core user responsible for progressing this lead.</span>
            </label>
            <label className="field">
              <span className="field-label">Estimated value (cents)</span>
              <input
                type="number"
                min={0}
                step={1000}
                className="input num"
                value={createForm.valueEstimateCents}
                onChange={(e) => setCreateForm({ ...createForm, valueEstimateCents: e.target.value })}
                placeholder="150000"
                required
              />
              <span className="text-xs text-muted">Example: 150000 = $1,500.00.</span>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Lead source</span>
              <select className="select" value={createForm.source} onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}>
                {LEAD_SOURCE_OPTIONS.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
                </select>
              <span className="text-xs text-muted">Source values follow existing schema values used in reporting.</span>
            </label>
            <label className="field">
              <span className="field-label">Current stage</span>
              <select className="select" value={createForm.stage} onChange={(e) => setCreateForm({ ...createForm, stage: e.target.value })}>
                {CREATE_STAGE_OPTIONS.map((stage) => (
                  <option key={stage} value={stage}>
                    {formatStageLabel(stage)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Default stage is New for first-touch opportunities.</span>
            </label>
          </div>
          {me ? <p className="text-xs text-muted">Current signed-in user: {me.userId} ({me.role})</p> : null}
          <button type="submit" disabled={pending} className="btn mt-2">
            {pending ? "Creating lead..." : "Add lead to pipeline"}
          </button>
        </form>

        <form onSubmit={markWon} className="card grid gap-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">Convert won deal</h2>
          <p className="text-xs text-muted">Finalize the deal and create a delivery project with an assigned manager.</p>
          <label className="field">
            <span className="field-label">Open deal</span>
            <select className="select" value={winForm.dealId} onChange={(e) => setWinForm({ ...winForm, dealId: e.target.value })} required>
              <option value="">Select deal or lead</option>
              {openDeals.map((deal) => {
                const lead = deal.leadId ? leadById.get(deal.leadId) : null;
                const value = deal.valueCents ?? lead?.valueEstimateCents ?? 0;
                const sourceLabel = lead
                  ? LEAD_SOURCE_OPTIONS.find((source) => source.value === lead.source)?.label ?? lead.source
                  : "Unknown source";
                return (
                  <option key={deal.id} value={deal.id}>
                    {lead ? `${lead.id} - ${sourceLabel} - ${formatCurrencyCents(value)} (${deal.id})` : `${deal.id} - ${formatCurrencyCents(value)}`}
                  </option>
                );
              })}
              {dealReadyLeads.map((lead) => (
                <option key={`lead:${lead.id}`} value={`lead:${lead.id}`}>
                  Create open deal from {lead.id} - {LEAD_SOURCE_OPTIONS.find((source) => source.value === lead.source)?.label ?? lead.source}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">If a lead has no deal yet, select the create option and conversion will auto-create it.</span>
          </label>
          <label className="field">
            <span className="field-label">Client name</span>
            <input className="input" value={winForm.clientName} onChange={(e) => setWinForm({ ...winForm, clientName: e.target.value })} placeholder="Acme Manufacturing" required />
            <span className="text-xs text-muted">Use the billing or legal client name that should appear on the project.</span>
          </label>
          <label className="field">
            <span className="field-label">Project manager</span>
            <select
              className="select"
              value={winForm.managerUserId}
              onChange={(e) => setWinForm({ ...winForm, managerUserId: e.target.value })}
              required
            >
              <option value="">Select manager</option>
              {coreUsers.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.fullName} - {user.role} ({user.userId})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Manager becomes the default delivery owner on the new project.</span>
          </label>
          {!loading && !canConvertOptions ? (
            <EmptyState title="No open deals available" guidance="Create a lead first. A linked deal is required before conversion." />
          ) : null}
          <button type="submit" disabled={pending || !canConvertOptions} className="btn mt-2">
            {pending ? "Converting..." : "Mark deal as won and create project"}
          </button>
        </form>
      </section>

      <section className="card">
        <form onSubmit={updateLeadStatus} className="grid gap-2 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto] md:items-end">
          <div className="md:col-span-3">
            <h2 className="text-sm font-semibold text-ink">Update lead stage</h2>
            <p className="mt-1 text-xs text-muted">Advance leads through qualification flow. To mark as won, use Convert won deal so project creation stays consistent.</p>
          </div>
          <label className="field">
            <span className="field-label">Lead</span>
            <select
              className="select"
              value={leadStageForm.leadId}
              onChange={(e) => {
                const nextLeadId = e.target.value;
                const nextLead = leads.find((lead) => lead.id === nextLeadId);
                setLeadStageForm({
                  leadId: nextLeadId,
                  stage: nextLead ? (nextLead.stage === "won" ? "proposal" : nextLead.stage) : "qualified",
                });
              }}
              required
            >
              <option value="">Select lead</option>
              {leads.filter((lead) => lead.stage !== "won").map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.id} - {LEAD_SOURCE_OPTIONS.find((item) => item.value === lead.source)?.label ?? lead.source} ({formatStageLabel(lead.stage)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">New stage</span>
            <select
              className="select"
              value={leadStageForm.stage}
              onChange={(e) => setLeadStageForm({ ...leadStageForm, stage: e.target.value })}
              required
            >
              {STAGE_UPDATE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {formatStageLabel(stage)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !leadStageForm.leadId} className="btn">
            {pending ? "Updating..." : "Update stage"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold text-ink">Lead register</h2>
        <p className="mt-1 text-xs text-muted">Review source quality, stage progression, and ownership at a glance.</p>
        {!loading && leads.length === 0 ? <EmptyState title="No leads yet" guidance="Create the first lead above to start pipeline tracking." /> : null}
        {!loading && leads.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Lead</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Stage</th>
                  <th className="pb-2">Value</th>
                  <th className="pb-2">Owner</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="py-2">
                      <p className="font-medium text-ink">{lead.id}</p>
                      <p className="text-xs text-muted">Lead record</p>
                    </td>
                    <td className="py-2">{LEAD_SOURCE_OPTIONS.find((item) => item.value === lead.source)?.label ?? lead.source}</td>
                    <td className="py-2"><StatusBadge status={lead.stage} /></td>
                    <td className="num py-2">{formatCurrencyCents(lead.valueEstimateCents)}</td>
                    <td className="py-2">
                      <p>{userById.get(lead.ownerUserId)?.fullName ?? "Unassigned owner"}</p>
                      <p className="font-mono text-xs text-muted">{lead.ownerUserId}</p>
                    </td>
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
