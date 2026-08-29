"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authFetch, authJson, createIdempotencyKey } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatCurrencyCents, formatDate, formatStatusLabel } from "@/lib/format";

const EXPENSE_CATEGORY_OPTIONS = ["rent", "software", "travel", "upwork", "ai_tools", "subscriptions", "other"] as const;

interface Expense {
  id: string;
  employeeUserId: string;
  category: (typeof EXPENSE_CATEGORY_OPTIONS)[number];
  amountCents: number;
  approverUserId: string;
  receiptUrl: string;
  status: "submitted" | "approved" | "reimbursed";
  incurredAtUtc: string;
}

interface StaffMember {
  staffId: string;
  fullName: string;
}

interface CoreUser {
  userId: string;
  role: "owner" | "hr" | "cto";
  fullName: string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [coreUsers, setCoreUsers] = useState<CoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeUserId: "",
    category: "software",
    amountCents: "",
    approverUserId: "owner-1",
    receiptUrl: "",
    incurredAtUtc: new Date().toISOString().slice(0, 10),
  });

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expenseRows, staffRows, coreUsersRows, me] = await Promise.all([
        authJson<Expense[]>("/api/expenses/list"),
        authJson<StaffMember[]>("/api/staff-members"),
        authJson<CoreUser[]>("/api/core-users"),
        getMeCached(),
      ]);
      setExpenses(expenseRows);
      setStaff(staffRows);
      setCoreUsers(coreUsersRows);
      const defaultApproverUserId = coreUsersRows.find((user) => user.role === "owner")?.userId ?? me.userId;
      setForm((current) => ({
        ...current,
        employeeUserId: current.employeeUserId || staffRows[0]?.staffId || "",
        approverUserId:
          current.approverUserId === "owner-1"
            ? defaultApproverUserId
            : current.approverUserId || defaultApproverUserId,
      }));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load expenses.");
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

  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm("Submit this expense?");
    if (!shouldContinue) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await authFetch("/api/expenses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey("expense"),
        },
        body: JSON.stringify({
          employeeUserId: form.employeeUserId,
          category: form.category,
          amountCents: Number(form.amountCents),
          approverUserId: form.approverUserId,
          receiptUrl: form.receiptUrl,
          incurredAtUtc: `${form.incurredAtUtc}T12:00:00.000Z`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new ApiClientError(body.message ?? "Expense submission failed.", response.status);
      }
      setForm((current) => ({ ...current, amountCents: "", receiptUrl: "" }));
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Expense submission failed.");
    }
    setSubmitting(false);
  }

  async function setStatus(expenseId: string, status: Expense["status"]) {
    const shouldContinue = window.confirm(`Mark expense as ${status}?`);
    if (!shouldContinue) {
      return;
    }

    setError(null);
    try {
      await authJson(`/api/expenses/${expenseId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Expense status update failed.");
    }
  }

  const submittedCount = expenses.filter((expense) => expense.status === "submitted").length;
  const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
  const reimbursedCount = expenses.filter((expense) => expense.status === "reimbursed").length;
  const queueValueCents = expenses
    .filter((expense) => expense.status !== "reimbursed")
    .reduce((total, expense) => total + expense.amountCents, 0);
  const staffById = new Map(staff.map((person) => [person.staffId, person.fullName]));
  const userById = new Map(coreUsers.map((user) => [user.userId, user]));

  return (
    <ModuleShell title="Expenses" description="Submit expenses and process approval queue from one screen.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading expense queue and approver context..." /> : null}

      {!loading ? (
        <section className="kpi-grid">
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Pending review</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{submittedCount}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Approved</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{approvedCount}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Reimbursed</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{reimbursedCount}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Open reimbursement value</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(queueValueCents)}</p>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">1. Capture expense</h3>
            <p className="mt-1 text-sm text-muted">Create a complete claim with staff, amount, approver, and receipt proof.</p>
          </div>
          <span className="status-badge status-info">Draft intake</span>
        </div>

        {!loading && staff.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No staff records available"
              guidance="Add staff profiles first so expenses can be assigned correctly."
            />
          </div>
        ) : null}

        <form onSubmit={submitExpense} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Employee</span>
            <select
              className="select"
              value={form.employeeUserId}
              onChange={(event) => setForm({ ...form, employeeUserId: event.target.value })}
              required
            >
              <option value="">Select staff</option>
              {staff.map((person) => (
                <option key={person.staffId} value={person.staffId}>
                  {person.fullName} ({person.staffId})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select
              className="select"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as Expense["category"] })}
            >
              {EXPENSE_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {formatStatusLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Amount (cents)</span>
            <input
              type="number"
              min={0}
              className="input num"
              placeholder="32500"
              value={form.amountCents}
              onChange={(event) => setForm({ ...form, amountCents: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Incurred date</span>
            <input
              type="date"
              className="input"
              value={form.incurredAtUtc}
              onChange={(event) => setForm({ ...form, incurredAtUtc: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Approver</span>
            <select
              className="select"
              value={form.approverUserId}
              onChange={(event) => setForm({ ...form, approverUserId: event.target.value })}
              required
            >
              <option value="">Select approver</option>
              {coreUsers.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.fullName} - {user.role} ({user.userId})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Receipt URL</span>
            <input
              className="input"
              placeholder="https://receipts.example.com/id"
              value={form.receiptUrl}
              onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })}
              required
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting || staff.length === 0 || coreUsers.length === 0}
              className="btn"
            >
              {submitting ? "Submitting claim..." : "Submit expense claim"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">2. Review and settle queue</h3>
            <p className="mt-1 text-sm text-muted">Approve eligible claims, then mark them reimbursed once payment clears.</p>
          </div>
          <span className="status-badge status-warn">Action required</span>
        </div>

        {loading ? <LoadingState label="Loading queue rows..." /> : null}
        {!loading && expenses.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No expenses yet" guidance="Submitted expenses appear here for approval and reimbursement." />
          </div>
        ) : null}
        {!loading && expenses.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Staff</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Approver</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Receipt</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="py-2">{formatDate(expense.incurredAtUtc)}</td>
                    <td className="py-2">
                      <p>{staffById.get(expense.employeeUserId) ?? "Unknown staff"}</p>
                      <p className="font-mono text-xs text-muted">{expense.employeeUserId}</p>
                    </td>
                    <td className="py-2">{formatStatusLabel(expense.category)}</td>
                    <td className="py-2">
                      <p>{userById.get(expense.approverUserId)?.fullName ?? "Unknown approver"}</p>
                      <p className="font-mono text-xs text-muted">{expense.approverUserId}</p>
                    </td>
                    <td className="num py-2">{formatCurrencyCents(expense.amountCents)}</td>
                    <td className="py-2"><StatusBadge status={expense.status} /></td>
                    <td className="py-2">
                      <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong">
                        Open receipt
                      </a>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "approved");
                          }}
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={expense.status !== "submitted"}
                        >
                          Approve claim
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "reimbursed");
                          }}
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={expense.status !== "approved"}
                        >
                          Mark paid
                        </button>
                      </div>
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
