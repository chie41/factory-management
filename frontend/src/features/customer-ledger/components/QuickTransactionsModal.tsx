import { QuickLaborPriceResolver, type PriceResolution } from './QuickLaborPriceResolver';
import { LedgerKeyboardContext } from "../hooks/ledgerKeyboardContext";
import { CatalogModelOption } from "../../catalog/CatalogModelOption";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Alert, App, Button, Modal, Space, Tag } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  workflowGet,
  workflowWrite,
  moneyOptions,
  type Order,
  type Workflow,
} from "../services/workflowService";
import { transactionLabels, type TransactionType } from "../types/ledger";
import {
  currencyText,
  decimalUnits,
  parseLocaleDecimal,
  weightText,
} from "../../../utils/decimal";
import { NewGoodsReturnForm } from "./WorkflowMoneyForms";
import {
  KeyboardSelect,
  KeyboardInput,
  KeyboardNumericInput,
  KeyboardTextarea,
  KeyboardDate,
  KeyboardCheckbox,
} from "./LedgerKeyboardCells";
import {
  LedgerFocusManager,
  address,
  type CellAddress,
} from "../utils/ledgerFocusManager";
import { usePermissions } from "../../auth/hooks/usePermissions";
import "./quick-transactions.css";
import {
  blank,
  line,
  fold,
  dec,
  totals,
  payload,
  type Choice,
  type Draft,
  type Line,
} from "../utils/quickEntryDraft";
import { quickFocusLayout } from "../utils/quickFocusLayout";
import { markLedgerDraft } from "../hooks/ledgerDraftGuard";

function Picker({
  kind,
  value,
  change,
  disabled,
  label,
  cell,
}: {
  cell: CellAddress;
  kind: string;
  value?: Choice;
  change: (v: Choice) => void;
  disabled?: boolean;
  label: string;
}) {
  const [q, setQ] = useState("");
  const options = useQuery({
    queryKey: ["quick-options", kind, q],
    queryFn: () =>
      workflowGet<Choice[]>("/customer-ledger/quick-entries/options", {
        kind,
        q,
      }),
  });
  const currentModel = kind === "models"
    ? options.data?.find(row => row.id === value?.id)
    : undefined;
  const rows = [
    ...(kind !== "employees" && value && (!q || fold(`${value.code} ${value.name}`).includes(fold(q)))
      ? [kind === "models" ? {
          ...value,
          image_url: currentModel ? currentModel.image_url : value.image_url,
        } : value]
      : []),
    ...(options.data ?? []).filter((v) => v.id !== value?.id),
  ];
  return (
    <KeyboardSelect
      cell={cell}
      aria-label={label}
      style={{ width: "100%" }}
      showSearch={{ onSearch: setQ, filterOption: false }}
      value={value?.id}
      labelRender={kind === "employees" ? option => value?.id === option.value ? value.name : option.label : undefined}
      placeholder={label}
      disabled={disabled}
      loading={options.isFetching}
      options={rows.map((v) => ({
        value: v.id,
        label: kind === "models" ? <CatalogModelOption model={v} /> : v.name,
      }))}
      onChange={(id) => {
        const v = rows.find((r) => r.id === id);
        if (v) change(v);
      }}
    />
  );
}
function SourceOrder({
  draft,
  change,
}: {
  draft: Draft;
  change: (patch: Partial<Draft>) => void;
}) {
  const orders = useQuery({
    queryKey: ["quick-source-orders", draft.customer?.id],
    queryFn: () =>
      workflowGet<Order[]>("/customer-ledger/delivery-orders", {
        customer_id: draft.customer?.id,
      }),
    enabled: !!draft.customer,
  });
  const choices = (orders.data ?? []).filter(
    (o) => !o.declaration && o.items.every((i) => !!i.design_model_id),
  );
  return (
    <div className="quick-common-grid">
      <label>
        Đơn nguồn (không bắt buộc)
        <KeyboardSelect
          cell={address(draft.id, "order", "source", "source")}
          aria-label="Đơn nguồn"
          allowClear
          value={draft.order?.id}
          placeholder="Giao trực tiếp"
          options={choices.map((o) => ({ value: o.id, label: o.order_code }))}
          onChange={(id) => {
            const order = choices.find((o) => o.id === id);
            if (order)
              change({
                order,
                tripId: order.assigned_trips?.[0]?.id,
                directLines: draft.directLines ?? draft.lines,
                lines: order.items.map((i) => ({
                  id: crypto.randomUUID(),
                  model: {
                    id: i.design_model_id!,
                    code: i.design_code_snapshot ?? "",
                    name: i.item_name,
                    image_url: i.design_image_snapshot,
                  },
                  quantity: String(i.quantity),
                  weight: i.unit_weight_g.replace(".", ","),
                  price: i.labor_price_per_15g.replace(".", ","),
                })),
              });
            else
              change({
                order: undefined,
                tripId: undefined,
                lines: draft.directLines ?? [line()],
              });
          }}
        />
      </label>
      {draft.order && (
        <label>
          Chuyến giao nguồn
          <KeyboardSelect
            cell={address(draft.id, "tripId", "source", "source")}
            value={draft.tripId}
            options={draft.order.assigned_trips?.map((t) => ({
              value: t.id,
              label: `${t.delivery_date} · ${t.full_name}`,
            }))}
            onChange={(tripId) => change({ tripId })}
          />
        </label>
      )}
    </div>
  );
}
function initialDraft(workflow?: Workflow): Draft {
  const d = blank();
  if (!workflow) return d;
  const l = workflow.ledger as Workflow["ledger"] & {
    customer_id: string;
    occurred_at: string;
    note?: string;
    transaction_employee?: Choice;
  };
  const p = workflow.payments.find(
    (p) => p.source === "DELIVERY" && p.status === "PENDING",
  ) as
    | (Workflow["payments"][number] & {
        occurred_at: string;
        collector?: Choice;
        note?: string;
      })
    | undefined;
  return {
    ...d,
    type: "DELIVERY",
    customer: { id: l.customer_id, code: "", name: "" },
    employee: l.transaction_employee,
    date: l.occurred_at,
    note: l.note ?? "",
    lines: workflow.items.map((i) => ({
      id: crypto.randomUUID(),
      sourceItemId: i.id,
      model: {
        id: i.design_model_id!,
        code: i.design_code_snapshot ?? "",
        name: i.item_name,
                    image_url: i.design_image_snapshot,
      },
      quantity: String(i.quantity),
      weight: i.unit_weight_g.replace(".", ","),
      price: i.labor_price_per_15g.replace(".", ","),
    })),
    discountType: workflow.submission.discount_type ?? "NONE",
    discount: (workflow.submission.discount_value ?? "0").replace(".", ","),
    hasReceipt: !!p,
    received: p?.amount.replace(".", ",") ?? "",
    currency: p?.currency ?? "THB",
    receivedDate: p?.occurred_at,
    collector: p?.collector,
    paymentNote: p?.note ?? "",
  };
}
export function QuickTransactionsModal({
  customerId,
  close,
  initialWorkflow,
}: {
  customerId?: string;
  close: () => void;
  initialWorkflow?: Workflow;
}) {
  const { can } = usePermissions(),
    { modal, message } = App.useApp(),
    cache = useQueryClient(),
    returnForm = useId();
  const [drafts, setDrafts] = useState<Draft[]>(() => [
      initialDraft(initialWorkflow),
    ]),
    [active, setActive] = useState(0),
    [errors, setErrors] = useState<Record<number, string>>({}),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    [returnReady, setReturnReady] = useState(false);
  const batchId = useRef(crypto.randomUUID()),
    sending = useRef(false),
    history = useRef<Draft[][]>([]),
    root = useRef<HTMLDivElement>(null);
  const [focus] = useState(() => new LedgerFocusManager());
  const action = useRef<"save" | "new" | undefined>(undefined);
  const [, requestAction] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const key = `quick-ledger:${returnForm}`;
    markLedgerDraft(key, dirty);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      markLedgerDraft(key, false);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, returnForm]);
  const customer = useQuery({
    queryKey: ["quick-fixed-customer", customerId],
    queryFn: () =>
      workflowGet<{
        customer: { id: string; customer_code: string; name: string };
      }>(`/customer-ledger/customers/${customerId}`),
    enabled: !!customerId,
  });
  const fixed = customer.data?.customer;
  const visibleDrafts = drafts.map((d) =>
    fixed
      ? {
          ...d,
          customer: {
            id: fixed.id,
            code: fixed.customer_code,
            name: fixed.name,
          },
        }
      : d,
  );
  const edit = (index: number, patch: Partial<Draft>) => {
    if (sending.current || pending) return;
    setDrafts((old) =>
      old.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
    setDirty(true);
    setErrors((old) => ({ ...old, [index]: "" }));
  };
  const applyPrices = useCallback((result: PriceResolution) => {
    setDrafts(current => current.map(draft => {
      if (draft.id !== result.draftId || draft.order || (customerId ?? draft.customer?.id) !== result.customerId) return draft;
      return { ...draft, lines: draft.lines.map(row => {
        const request = result.requests.find(r => r.lineId === row.id && r.modelId === row.model?.id && r.requestId === row.pricingRequestId);
        if (!request) return row;
        const price = result.rows?.find(p => p.design_model_id === request.modelId);
        const error = result.error ?? (!price ? 'Không lấy được giá công; thử lại hoặc nhập giá thủ công.' :
          price.labor_price_per_15g == null ? 'Mẫu và nhóm chưa có giá công; hãy nhập giá thủ công.' :
          price.currency !== 'THB' ? 'Giá đề xuất không phải B; hãy nhập giá công bằng B.' : undefined);
        return { ...row, pricingRequestId: undefined, pricingError: error,
          price: !error && price?.labor_price_per_15g != null ? price.labor_price_per_15g.replace('.', ',') : '',
          priceSource: !error ? price?.source : undefined };
      }) };
    }));
  }, [customerId]);
  const structure = (next: Draft[]) => {
    if (sending.current || pending) return;
    history.current.push(structuredClone(drafts));
    setDrafts(next);
    setDirty(true);
  };
  const validate = (d: Draft, index: number) => {
    try {
      payload(d);
      setErrors((e) => ({ ...e, [index]: "" }));
      return true;
    } catch (e) {
      setErrors((old) => ({ ...old, [index]: (e as Error).message }));
      return false;
    }
  };
  const add = () => {
    const current = visibleDrafts[active];
    if (!validate(current, active)) return;
    structure([...drafts, blank(current)]);
    setActive(drafts.length);
  };
  const save = async () => {
    if (sending.current) return;
    const issues: Record<number, string> = {};
    const entries = visibleDrafts.flatMap((d, i) => {
      try {
        return [payload(d)];
      } catch (e) {
        issues[i] = (e as Error).message;
        return [];
      }
    });
    setErrors(issues);
    if (Object.keys(issues).length) {
      setActive(Number(Object.keys(issues)[0]));
      focus.focusTransaction(visibleDrafts[Number(Object.keys(issues)[0])].id);
      return;
    }
    sending.current = true;
    setPending(true);
    try {
      await workflowWrite(
        initialWorkflow
          ? `/customer-ledger/quick-entries/${initialWorkflow.id}/resubmit`
          : "/customer-ledger/quick-entries",
        {
          request_id: batchId.current,
          entries,
          ...(initialWorkflow ? { version: initialWorkflow.version } : {}),
        },
      );
      await cache.invalidateQueries();
      message.success(
        "Đã ghi nhận giao dịch và khoản thu kèm theo, không cần chờ duyệt.",
      );
      close();
    } catch (e) {
      const err = e as {
        response?: {
          data?: {
            message?: string;
            errors?: { block: number; message: string }[];
          };
        };
      };
      const apiErrors = err.response?.data?.errors;
      if (apiErrors) {
        setErrors(
          Object.fromEntries(apiErrors.map((x) => [x.block, x.message])),
        );
        setActive(apiErrors[0].block);
      } else
        setErrors({
          [active]:
            err.response?.data?.message ??
            "Lưu chưa thành công. Bản nhập được giữ nguyên; thử gửi lại để kiểm tra kết quả.",
        });
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  const cancel = () => {
    if (pending) return;
    if (!dirty) close();
    else
      modal.confirm({
        title: "Đóng dữ liệu chưa lưu?",
        content: "Các giao dịch đang nhập sẽ bị bỏ.",
        okText: "Đóng",
        cancelText: "Tiếp tục nhập",
        onOk: close,
      });
  };
  const removeLine = (transactionId: string, rowId: string) => {
    const d = drafts.find((d) => d.id === transactionId);
    if (!d) return;
    const remaining = d.lines.filter((l) => l.id !== rowId),
      lines = remaining.length ? remaining : [line()];
    focus.deleted(
      address(d.id, "model", rowId, "items"),
      lines.map((l) => l.id),
    );
    structure(
      drafts.map((v) => (v.id === transactionId ? { ...v, lines } : v)),
    );
  };
  const shortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.nativeEvent.isComposing ||
      focus.composing ||
      event.keyCode === 229 ||
      pending
    )
      return;
    const target = event.target as HTMLElement,
      block = target.closest<HTMLElement>("[data-block]"),
      index = Number(block?.dataset.block ?? active),
      d = visibleDrafts[index],
      row = target.closest<HTMLElement>("[data-line]"),
      lineIndex = d.lines.findIndex((l) => l.id === row?.dataset.rowId);
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      if (d.type === "RETURN_GOODS")
        root.current
          ?.querySelector<HTMLFormElement>(`#${CSS.escape(returnForm)}`)
          ?.requestSubmit();
      else if (focus.finishEdit()) {
        action.current = "save";
        requestAction();
      }
      event.stopPropagation();
      return;
    }
    if (event.ctrlKey && event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      if (!customerId && focus.finishEdit()) {
        action.current = "new";
        requestAction();
      }
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (row && d.type === "DELIVERY" && !d.order) {
        const lines = [...d.lines];
        lines.splice(lineIndex + 1, 0, {
          ...structuredClone(lines[lineIndex]),
          id: crypto.randomUUID(),
        });
        structure(drafts.map((v, i) => (i === index ? { ...v, lines } : v)));
      } else if (!customerId) {
        const copy = {
          ...structuredClone(d),
          id: crypto.randomUUID(),
          receiptId: crypto.randomUUID(),
          lines: d.lines.map((l) => ({ ...l, id: crypto.randomUUID() })),
        };
        structure([...drafts, copy]);
        setActive(drafts.length);
      }
      return;
    }
    if (event.ctrlKey && event.key === "Delete" && row && !d.order) {
      event.preventDefault();
      event.stopPropagation();
      removeLine(d.id, row.dataset.rowId!);
      return;
    }
    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "z" &&
      !(
        target.matches("input,textarea,[contenteditable=true]") &&
        focus.snapshot().mode === "edit"
      )
    ) {
      event.preventDefault();
      const prior = history.current.pop();
      if (prior) {
        setDrafts(prior);
        setActive(Math.min(active, prior.length - 1));
      }
      return;
    }
  };
  const types: TransactionType[] = [
    "DELIVERY",
    "RETURN_GOLD",
    "GOLD_RETURN_TO_CUSTOMER",
    "RETURN_RECOVERED_GOLD",
    ...(customerId ? ["RETURN_GOODS" as const] : []),
  ];
  useLayoutEffect(() => {
    const appendRow = (cell: CellAddress) => {
      const index = visibleDrafts.findIndex((d) => d.id === cell.transactionId),
        d = visibleDrafts[index];
      if (!d || d.order || pending) return undefined;
      const current = d.lines.find((l) => l.id === cell.rowId);
      if (
        !current ||
        (!current.model &&
          !current.quantity &&
          !current.weight &&
          !current.price)
      )
        return undefined;
      try {
        totals({ ...d, lines: [current], discountType: "NONE" });
      } catch (e) {
        setErrors((old) => ({ ...old, [index]: (e as Error).message }));
        return cell;
      }
      const next = line();
      structure(
        drafts.map((v) =>
          v.id === d.id ? { ...v, lines: [...v.lines, next] } : v,
        ),
      );
      return address(d.id, cell.fieldKey, next.id, "items");
    };
    const restore = (cell: CellAddress, value: string) => {
      const index = visibleDrafts.findIndex((d) => d.id === cell.transactionId),
        d = visibleDrafts[index];
      if (!d) return;
      if (cell.section === "items")
        edit(index, {
          lines: d.lines.map((l) =>
            l.id === cell.rowId ? { ...l, [cell.fieldKey]: value } : l,
          ),
        });
      else edit(index, { [cell.fieldKey]: value } as Partial<Draft>);
    };
    focus.configure({ appendRow, restore, refresh: requestAction });
    focus.layout(
      quickFocusLayout(visibleDrafts[active], {
        fixedCustomer: !!customerId,
        sourceOrders: can("delivery.report") && !initialWorkflow,
        canCollect: can("customer_ledger.collect"),
        pending,
      }),
    );
  });
  useLayoutEffect(() => {
    const next = action.current;
    action.current = undefined;
    if (next === "save") void save();
    else if (next === "new") add();
  });
  const activeId = visibleDrafts[active].id;
  useLayoutEffect(() => focus.focusTransaction(activeId), [focus, activeId]);
  return (
    <Modal
      modalRender={(node) => (
        <LedgerKeyboardContext.Provider value={focus}>
          <div onKeyDownCapture={shortcut}>{node}</div>
        </LedgerKeyboardContext.Provider>
      )}
      afterOpenChange={(open) => {
        if (open && !root.current?.contains(document.activeElement))
          focus.focusTransaction(visibleDrafts[active].id);
      }}
      open
      title={customerId ? "Thêm giao dịch" : "Nhập giao dịch nhanh"}
      width="94vw"
      style={{ top: 24, maxWidth: 1600 }}
      rootClassName="quick-ledger-modal"
      onCancel={cancel}
      maskClosable={false}
      keyboard={false}
      closable={!pending}
      footer={
        <Space>
          <span className="quick-key-help">
            Ctrl+↓ giao dịch tiếp · Ctrl+D sao chép · Ctrl+Enter lưu
          </span>
          <Button
            onClick={() => {
              const prior = history.current.pop();
              if (prior) {
                setDrafts(prior);
                setActive(Math.min(active, prior.length - 1));
              }
            }}
            disabled={!history.current.length || pending}
          >
            Hoàn tác
          </Button>
          {visibleDrafts[0]?.type === "RETURN_GOODS" ? (
            <Button
              type="primary"
              htmlType="submit"
              form={returnForm}
              loading={pending}
              disabled={!returnReady}
            >
              Lưu phiếu trả hàng
            </Button>
          ) : (
            <Button
              type="primary"
              loading={pending}
              onClick={() => void save()}
            >
              Lưu {customerId ? "giao dịch" : "tất cả giao dịch"}
            </Button>
          )}
        </Space>
      }
    >
      <div
        ref={root}
        tabIndex={-1}
        className="quick-ledger-content"
        aria-busy={pending}
      >
        {visibleDrafts.map((d, index) => {
          let summary;
          try {
            summary = totals(d);
          } catch {
            /* incomplete input */
          }
          const changeLine = (li: number, patch: Partial<Line>) =>
            edit(index, {
              lines: d.lines.map((l, i) => (i === li ? { ...l, ...patch } : l)),
            });
          return (
            <section
              className={`quick-block ${active === index ? "is-active" : ""}`}
              data-block={index}
              key={d.id}
            >
              <QuickLaborPriceResolver draft={d} apply={applyPrices} />
              <div className="quick-block-heading">
                <Button
                  type="text"
                  onClick={() => {
                    if (active !== index)
                      validate(visibleDrafts[active], active);
                    setActive(index);
                  }}
                >
                  #{index + 1} ·{" "}
                  {d.type ? transactionLabels[d.type] : "Chọn giao dịch"} ·{" "}
                  {d.customer?.name ?? "Chưa chọn khách hàng"}
                </Button>
                {active !== index && summary && d.type === "DELIVERY" && (
                  <span>
                    {weightText(dec(summary.gold))} ·{" "}
                    {currencyText(dec(summary.net), "THB")}
                  </span>
                )}
                <Space>
                  <Tag
                    color={
                      errors[index] ? "error" : d.type ? "blue" : "default"
                    }
                  >
                    {errors[index]
                      ? "Cần kiểm tra"
                      : d.type
                        ? "Chưa lưu"
                        : "Trống"}
                  </Tag>
                  {!customerId && drafts.length > 1 && (
                    <Button
                      danger
                      type="text"
                      onClick={() => {
                        structure(drafts.filter((_, i) => i !== index));
                        setActive(Math.max(0, index - 1));
                      }}
                    >
                      Xóa giao dịch
                    </Button>
                  )}
                </Space>
              </div>
              {errors[index] && (
                <Alert type="error" showIcon title={errors[index]} />
              )}
              <fieldset
                disabled={pending}
                hidden={active !== index}
                className="quick-block-body"
              >
                <div className="quick-common-grid">
                  <label>
                    Loại giao dịch{" "}
                    <KeyboardSelect
                      cell={address(d.id, "type")}
                      aria-label="Loại giao dịch"
                      value={d.type}
                      placeholder="GH / TV / VH / VK"
                      showSearch={{
                        filterOption: (q, o) =>
                          fold(`${o?.label} ${o?.alias}`).includes(fold(q)),
                      }}
                      options={types.map((value, i) => ({
                        value,
                        label: transactionLabels[value],
                        alias: ["GH", "TV", "VK", "VH", "TH"][i],
                        disabled:
                          value === "RETURN_GOODS" &&
                          !can("customer_ledger.returns.manage"),
                      }))}
                      onChange={(type) =>
                        edit(index, { type: type as TransactionType })
                      }
                    />
                  </label>
                  <label>
                    Khách hàng{" "}
                    <Picker
                      cell={address(d.id, "customer")}
                      label="Tìm tên khách hàng"
                      kind="customers"
                      value={d.customer}
                      change={(customer) => {
                        if (customer.id === d.customer?.id) return;
                        edit(index, {
                          customer,
                          order: undefined,
                          tripId: undefined,
                          directLines: undefined,
                          lines: (d.directLines ?? d.lines).map(row => ({...row, price: row.model ? '' : row.price,
                            pricingRequestId: row.model ? crypto.randomUUID() : undefined, priceSource: undefined, pricingError: undefined})),
                        });
                      }}
                      disabled={!!customerId || pending}
                    />
                  </label>
                  <label>
                    Ngày giao dịch{" "}
                    <KeyboardDate
                      cell={address(d.id, "date")}
                      value={d.date}
                      onChange={(date) => edit(index, { date })}
                    />
                  </label>
                  <label>
                    Người giao dịch{" "}
                    <Picker
                      cell={address(d.id, "employee")}
                      label="Tìm tên nhân viên"
                      kind="employees"
                      value={d.employee}
                      change={(employee) => edit(index, { employee })}
                    />
                  </label>
                </div>
                {customerId && can("customer_ledger.returns.manage") && (
                  <div hidden={d.type !== "RETURN_GOODS"}>
                    <NewGoodsReturnForm
                      common={{ employeeId: d.employee?.id, date: d.date }}
                      customerId={customerId}
                      formId={returnForm}
                      close={close}
                      onPending={setPending}
                      onReady={setReturnReady}
                      onDirty={setDirty}
                    />
                  </div>
                )}
                {d.type === "RETURN_GOODS" ? null : d.type === "DELIVERY" ? (
                  <>
                    <div className="quick-table-wrap">
                      <table className="quick-lines">
                        <thead>
                          <tr>
                            {[
                              "STT",
                              "Mẫu mã",
                              "Số lượng",
                              "TL SP (g)",
                              "TL tổng",
                              "Giá công / 15g",
                              "Thành tiền",
                              "",
                            ].map((h, i) => (
                              <th key={i}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l, li) => {
                            let t;
                            try {
                              t = totals({
                                ...d,
                                lines: [l],
                                discountType: "NONE",
                              });
                            } catch {
                              /* draft */
                            }
                            return (
                              <tr key={l.id} data-line={li} data-row-id={l.id}>
                                <td>{li + 1}</td>
                                <td>
                                  <Picker
                                    cell={address(d.id, "model", l.id, "items")}
                                    kind="models"
                                    label="Mã / tên mẫu mã"
                                    disabled={!!d.order}
                                    value={l.model}
                                    change={(model) => {
                                      if (model.id === l.model?.id) return;
                                      changeLine(li, {
                                        model, sourceItemId: undefined,
                                        weight: model.weight_g?.replace('.', ',') ?? '',
                                        price: '', pricingRequestId: crypto.randomUUID(), priceSource: undefined, pricingError: undefined,
                                      });
                                    }}
                                  />
                                </td>
                                <td>
                                  <KeyboardInput
                                    aria-label={`Số lượng dòng ${li + 1}`}
                                    disabled={!!d.order}
                                    cell={address(
                                      d.id,
                                      "quantity",
                                      l.id,
                                      "items",
                                    )}
                                    value={l.quantity}
                                    inputMode="numeric"
                                    onChange={(e) =>
                                      changeLine(li, {
                                        quantity: e.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <KeyboardNumericInput
                                    displayPrecision={2}
                                    aria-label={`Trọng lượng dòng ${li + 1}`}
                                    disabled={!!d.order}
                                    cell={address(
                                      d.id,
                                      "weight",
                                      l.id,
                                      "items",
                                    )}
                                    value={l.weight}
                                    inputMode="decimal"
                                    onChange={(e) =>
                                      changeLine(li, { weight: e.target.value })
                                    }
                                  />
                                </td>
                                <td>{t ? weightText(dec(t.gold)) : "—"}</td>
                                <td>
                                  <KeyboardNumericInput
                                    displayPrecision={0}
                                    aria-label={`Giá công dòng ${li + 1}`}
                                    disabled={!!d.order}
                                    cell={address(d.id, "price", l.id, "items")}
                                    value={l.price}
                                    inputMode="decimal"
                                    onChange={(e) =>
                                      changeLine(li, { price: e.target.value, pricingRequestId: undefined, pricingError: undefined, priceSource: 'MANUAL' })
                                    }
                                  />
                                  {l.pricingRequestId && <small style={{color:'#788494'}}> {d.customer ? 'Đang lấy giá…' : 'Chọn khách để lấy giá'}</small>}
                                  {l.priceSource === 'CUSTOMER' && <small style={{color:'#1677ff'}}>Giá riêng khách/mẫu</small>}
                                  {l.priceSource === 'GROUP' && <small style={{color:'#1677ff'}}>Giá riêng khách/nhóm</small>}
                                  {l.priceSource === 'MODEL' && <small style={{color:'#788494'}}>Giá riêng mẫu</small>}
                                  {l.priceSource === 'GROUP_DEFAULT' && <small style={{color:'#788494'}}>Theo nhóm</small>}
                                  {l.pricingError && <div role="alert" style={{color:'#d46b08',fontSize:11}}>{l.pricingError}<Button size="small" type="link" onClick={() => changeLine(li,{pricingRequestId:crypto.randomUUID(),pricingError:undefined})}>Thử lại</Button></div>}
                                </td>
                                <td>
                                  {t ? currencyText(dec(t.gross), "THB") : "—"}
                                </td>
                                <td>
                                  <Button
                                    type="text"
                                    danger
                                    disabled={!!d.order}
                                    onClick={() => {
                                      removeLine(d.id, l.id);
                                    }}
                                  >
                                    Xóa
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      disabled={!!d.order}
                      onClick={() =>
                        edit(index, { lines: [...d.lines, line()] })
                      }
                    >
                      + Thêm dòng mẫu mã
                    </Button>
                    {can("delivery.report") && !initialWorkflow && (
                      <SourceOrder
                        draft={d}
                        change={(patch) => edit(index, patch)}
                      />
                    )}
                    <div className="quick-bottom">
                      <div>
                        <label>
                          Giảm giá{" "}
                          <KeyboardSelect
                            cell={address(
                              d.id,
                              "discountType",
                              "details",
                              "details",
                            )}
                            value={d.discountType}
                            onChange={(discountType) =>
                              edit(index, { discountType })
                            }
                            options={[
                              { value: "NONE", label: "Không giảm" },
                              {
                                value: "PERCENT",
                                label: "Giảm theo phần trăm",
                              },
                              { value: "AMOUNT", label: "Giảm theo tiền" },
                            ]}
                          />
                        </label>
                        {d.discountType !== "NONE" && (
                          <label>
                            Giá trị giảm{" "}
                            <KeyboardInput
                              cell={address(
                                d.id,
                                "discount",
                                "details",
                                "details",
                              )}
                              value={d.discount}
                              onChange={(e) =>
                                edit(index, { discount: e.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                      <div className="quick-summary">
                        <p>
                          Tổng trọng lượng{" "}
                          <strong>
                            {summary ? weightText(dec(summary.gold)) : "—"}
                          </strong>
                        </p>
                        <p>
                          Tổng tiền công{" "}
                          <strong>
                            {summary
                              ? currencyText(dec(summary.gross), "THB")
                              : "—"}
                          </strong>
                        </p>
                        <p>
                          Giảm giá{" "}
                          <strong>
                            {summary
                              ? currencyText(dec(summary.discount), "THB")
                              : "—"}
                          </strong>
                        </p>
                        <p>
                          Phải thu{" "}
                          <strong>
                            {summary
                              ? currencyText(dec(summary.net), "THB")
                              : "—"}
                          </strong>
                        </p>
                      </div>
                    </div>
                    <KeyboardCheckbox
                      cell={address(d.id, "hasReceipt", "details", "details")}
                      checked={d.hasReceipt}
                      disabled={!can("customer_ledger.collect")}
                      onChange={(e) =>
                        edit(index, { hasReceipt: e.target.checked })
                      }
                    >
                      Kèm khoản tiền đã thu
                    </KeyboardCheckbox>
                    {d.hasReceipt && (
                      <div className="quick-common-grid">
                        <label>
                          Số tiền đã thu{" "}
                          <KeyboardNumericInput
                            cell={address(
                              d.id,
                              "received",
                              "receipt",
                              "receipt",
                            )}
                            value={d.received}
                            onChange={(e) =>
                              edit(index, { received: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Đồng tiền{" "}
                          <KeyboardSelect
                            cell={address(
                              d.id,
                              "currency",
                              "receipt",
                              "receipt",
                            )}
                            value={d.currency}
                            options={moneyOptions}
                            onChange={(currency) => edit(index, { currency, confirmedFx: undefined })}
                          />
                        </label>
                        {d.currency !== "THB" && (
                          <label>
                            Tỷ giá xác nhận ({d.currency} / 1 THB)
                            <KeyboardNumericInput
                              cell={address(d.id, "confirmedFx", "receipt", "receipt")}
                              value={d.confirmedFx ?? ""}
                              onChange={(e) => edit(index, { confirmedFx: e.target.value })}
                            />
                          </label>
                        )}
                        <label>
                          Ngày thu thực tế{" "}
                          <KeyboardDate
                            cell={address(
                              d.id,
                              "receivedDate",
                              "receipt",
                              "receipt",
                            )}
                            value={d.receivedDate}
                            onChange={(receivedDate) =>
                              edit(index, { receivedDate })
                            }
                          />
                        </label>
                        <label>
                          Người thu tiền{" "}
                          <Picker
                            cell={address(
                              d.id,
                              "collector",
                              "receipt",
                              "receipt",
                            )}
                            kind="employees"
                            label="Tìm tên nhân viên"
                            value={d.collector}
                            change={(collector) => edit(index, { collector })}
                          />
                        </label>
                        <label>
                          Ghi chú khoản thu{" "}
                          <KeyboardInput
                            cell={address(
                              d.id,
                              "paymentNote",
                              "receipt",
                              "receipt",
                            )}
                            value={d.paymentNote}
                            onChange={(e) =>
                              edit(index, { paymentNote: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  d.type && (
                    <div className="quick-common-grid">
                      {d.type === "RETURN_RECOVERED_GOLD" ? (
                        <>
                          <label>
                            Trọng lượng thực (g){" "}
                            <KeyboardInput
                              cell={address(
                                d.id,
                                "actual",
                                "details",
                                "details",
                              )}
                              value={d.actual}
                              onChange={(e) =>
                                edit(index, { actual: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Tuổi vàng (%){" "}
                            <KeyboardInput
                              cell={address(
                                d.id,
                                "purity",
                                "details",
                                "details",
                              )}
                              value={d.purity}
                              onChange={(e) =>
                                edit(index, { purity: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Vàng quy đổi{" "}
                            <strong>
                              {(() => {
                                try {
                                  const a = decimalUnits(
                                      parseLocaleDecimal(d.actual),
                                    ),
                                    p = decimalUnits(
                                      parseLocaleDecimal(d.purity),
                                    );
                                  return weightText(
                                    dec((a * p + 500000n) / 1000000n),
                                  );
                                } catch {
                                  return "—";
                                }
                              })()}
                            </strong>
                          </label>
                        </>
                      ) : (
                        <label>
                          Trọng lượng vàng (g){" "}
                          <KeyboardNumericInput
                            cell={address(d.id, "gold", "details", "details")}
                            value={d.gold}
                            onChange={(e) =>
                              edit(index, { gold: e.target.value })
                            }
                          />
                        </label>
                      )}
                    </div>
                  )
                )}
                {d.type !== "RETURN_GOODS" && (
                  <label>
                    Ghi chú{" "}
                    <KeyboardTextarea
                      rows={2}
                      cell={address(d.id, "note", "note", "note")}
                      value={d.note}
                      onChange={(e) => edit(index, { note: e.target.value })}
                    />
                  </label>
                )}
              </fieldset>
            </section>
          );
        })}
        {!customerId && (
          <Button onClick={add} disabled={pending}>
            + Thêm giao dịch tiếp (Ctrl+↓)
          </Button>
        )}
        <p className="quick-key-help">
          Tab / Shift+Tab sang ô · Enter / Shift+Enter xuống/lên dòng · Mũi tên
          chọn ô · F2 sửa ô · Esc đóng lựa chọn · Ctrl+; ngày hôm nay trong ô
          ngày · Ctrl+Delete xóa dòng · Hoàn tác để khôi phục dòng đã xóa. Số:
          10.000 hoặc 0,1234.
        </p>
      </div>
    </Modal>
  );
}
