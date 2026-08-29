"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authFetch, authJson, createIdempotencyKey } from "@/lib/client-api";

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
      const [expenseRows, staffRows] = await Promise.all([
        authJson<Expense[]>("/api/expenses/list"),
        authJson<StaffMember[]>("/api/staff-members"),
      ]);
      setExpenses(expenseRows);
      setStaff(staffRows);
      setForm((current) => ({
        ...current,
        employeeUserId: current.employeeUserId || staffRows[0]?.staffId || "",
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
    <ModuleShell
      title="Expenses"
      description="Submit expenses and process approval queue from one screen."
      endpoints={["GET /api/expenses/list", "POST /api/expenses", "PATCH /api/expenses/:expenseId/status"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Submit expense</h3>
        <form onSubmit={submitExpense} className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            className="rounded border border-border px-3 py-2 text-sm"
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
          <select
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value as Expense["category"] })}
          >
            {"rent,software,travel,other".split(",").map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Amount (cents)"
            value={form.amountCents}
            onChange={(event) => setForm({ ...form, amountCents: event.target.value })}
            required
          />
          <input
            type="date"
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.incurredAtUtc}
            onChange={(event) => setForm({ ...form, incurredAtUtc: event.target.value })}
            required
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Approver user id"
            value={form.approverUserId}
            onChange={(event) => setForm({ ...form, approverUserId: event.target.value })}
            required
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Receipt URL"
            value={form.receiptUrl}
            onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })}
            required
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit expense"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Approval queue</h3>
        {loading ? <p className="mt-3 text-sm text-zinc-600">Loading expenses...</p> : null}
        {!loading && expenses.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No expenses yet.</p> : null}
        {!loading && expenses.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-zinc-600">
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
                  <tr key={expense.id} className="border-b border-border/60">
                    <td className="py-2">{expense.incurredAtUtc.slice(0, 10)}</td>
                    <td className="py-2">{expense.employeeUserId}</td>
                    <td className="py-2">{expense.category}</td>
                    <td className="py-2">{expense.amountCents}</td>
                    <td className="py-2">{expense.status}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "approved");
                          }}
                          className="rounded border border-border px-2 py-1 text-xs"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void setStatus(expense.id, "reimbursed");
                          }}
                          className="rounded border border-border px-2 py-1 text-xs"
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
