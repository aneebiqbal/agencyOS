"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authFetch, authJson, createIdempotencyKey } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatCurrencyCents, formatDate } from "@/lib/format";

interface Expense {
  id: string;
  employeeUserId: string;
  category: "rent" | "software" | "travel" | "other";
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

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
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
      const [expenseRows, staffRows, me] = await Promise.all([
        authJson<Expense[]>("/api/expenses/list"),
        authJson<StaffMember[]>("/api/staff-members"),
        getMeCached(),
      ]);
      setExpenses(expenseRows);
      setStaff(staffRows);
      setForm((current) => ({
        ...current,
        employeeUserId: current.employeeUserId || staffRows[0]?.staffId || "",
        approverUserId: current.approverUserId === "owner-1" ? me.userId : current.approverUserId,
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

  return (
    <ModuleShell title="Expenses" description="Submit expenses and process approval queue from one screen.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading expense queue..." /> : null}

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Submit expense</h3>
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
              {"rent,software,travel,other".split(",").map((category) => (
                <option key={category} value={category}>
                  {category}
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
            <span className="field-label">Approver user ID</span>
            <input
              className="input"
              placeholder="approver user id"
              value={form.approverUserId}
              onChange={(event) => setForm({ ...form, approverUserId: event.target.value })}
              required
            />
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
              disabled={submitting}
              className="btn"
            >
              {submitting ? "Submitting..." : "Submit expense"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Approval queue</h3>
        {!loading && expenses.length === 0 ? (
          <EmptyState title="No expenses yet" guidance="Submitted expenses appear here for approval and reimbursement." />
        ) : null}
        {!loading && expenses.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Staff</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="py-2">{formatDate(expense.incurredAtUtc)}</td>
                    <td className="py-2">{expense.employeeUserId}</td>
                    <td className="py-2">{expense.category}</td>
                    <td className="num py-2">{formatCurrencyCents(expense.amountCents)}</td>
                    <td className="py-2"><StatusBadge status={expense.status} /></td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "approved");
                          }}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "reimbursed");
                          }}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          Mark reimbursed
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
