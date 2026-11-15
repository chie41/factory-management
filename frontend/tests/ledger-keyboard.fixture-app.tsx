// Isolated UI test page. Every API request is intercepted; nothing reaches the database.
import React from "react";

import { App, Button, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickTransactionsModal } from "../src/features/customer-ledger/components/QuickTransactionsModal";
import { PermissionContext } from "../src/features/auth/hooks/usePermissions";
import { apiClient } from "../src/services/apiClient";
const choices = {
  customers: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      code: "KH000001",
      name: "VINH",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      code: "KH000002",
      name: "Khách khác",
    },
  ],
  employees: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      code: "NV000001",
      name: "Phạm Việt Hà",
    },
  ],
  models: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      code: "MM000001",
      name: "Dây XO 1B",
      weight_g: "30.0000",
      default_labor_price_per_15g: "350.0000",
      default_labor_currency: "THB",
    },
  ],
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
let saved: (data: unknown) => void = () => {};
apiClient.defaults.adapter = async (config) => {
  let data: unknown;
  if (config.url === "/customer-ledger/quick-entries/options") {
    const kind = config.params?.kind as keyof typeof choices,
      q = fold(config.params?.q ?? "");
    data = {
      data: (choices[kind] ?? []).filter((v) =>
        fold(v.code + " " + v.name).includes(q),
      ),
    };
  } else if (
    config.url === "/customer-ledger/quick-entries" &&
    config.method === "post"
  ) {
    const body = JSON.parse(config.data as string);
    saved(body);
    data = {
      data: {
        entries: body.entries.map((e: { request_id: string }) => ({
          id: e.request_id,
        })),
      },
    };
  } else throw Error("Unexpected fixture request: " + config.url);
  return { data, status: 200, statusText: "OK", headers: {}, config };
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function Fixture() {
  const [open, setOpen] = React.useState(false),
    [result, setResult] = React.useState<unknown>();
  React.useEffect(() => {
    saved = setResult;
  }, []);
  return (
    <>
      <h1>Kiểm thử keyboard — không ghi database</h1>
      <Button onClick={() => setOpen(true)}>Mở nhập nhanh</Button>
      {open && <QuickTransactionsModal close={() => setOpen(false)} />}
      <pre data-testid="saved-payload">{JSON.stringify(result, null, 2)}</pre>
    </>
  );
}
if (!import.meta.env.DEV) throw Error("This test fixture is development-only");
export function FixtureApp(){return (
  <ConfigProvider>
    <QueryClientProvider client={client}>
      <PermissionContext.Provider
        value={["customer_ledger.create", "customer_ledger.collect"]}
      >
        <App>
          <Fixture />
        </App>
      </PermissionContext.Provider>
    </QueryClientProvider>
  </ConfigProvider>
);}
