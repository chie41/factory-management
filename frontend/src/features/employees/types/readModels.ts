// Proposed read models for the missing endpoints; see docs/api-read-models.md.
export type WorkRow = { id: string; assignment_code: string; assignment_date: string; description: string; gold_issued_g: string; gold_received_g: string | null; variance_g: string | null; labor_amount: string | null; currency: string; status: 'HOLDING' | 'SETTLED' | 'CANCELLED'; note?: string }
export type PayrollLine = { id: string; date: string; type: string; description: string; source: string; reference: string; original_amount: string; original_currency: string; amount_thb: string; status: string }
export type PayrollPeriod = { id: string; name: string; summary_thb: { labor: string; bonus: string; allowance: string; advance: string; supplies: string; penalty: string; gold_variance: string; net: string }; lines: PayrollLine[] }
export type SuppliesRow = { id: string; supply_name: string; quantity: number; date: string; transaction_type: string; reference: string; amount: string; currency: string; payment_method: string }
export type ActivityRow = { id: string; occurred_at: string; description: string; actor_name: string }
export type EmployeeReadModels = { work: { assignments: WorkRow[] }; payroll: { periods: PayrollPeriod[] }; supplies: { held: SuppliesRow[]; history: SuppliesRow[] }; activity: ActivityRow[] }

