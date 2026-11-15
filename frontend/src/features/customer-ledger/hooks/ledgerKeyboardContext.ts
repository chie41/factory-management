import { createContext } from "react";
import type { LedgerFocusManager } from "../utils/ledgerFocusManager";
export const LedgerKeyboardContext = createContext<LedgerFocusManager | null>(
  null,
);
