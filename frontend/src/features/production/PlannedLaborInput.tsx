import {
  ProductionNumericInput,
  type ProductionNumericProps,
} from "./ProductionNumericInput";
export function PlannedLaborInput(props: ProductionNumericProps) {
  return <ProductionNumericInput {...props} precision={0} />;
}
