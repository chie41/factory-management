import { Input } from 'antd'
import type { ComponentProps } from 'react'
import { decimalText, parseLocaleDecimal } from '../../../utils/decimal'
type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value?: string
  onChange?: (value: string) => void
}
/** Form values stay canonical; an invalid prefix never passes the decimal validator. */
export function LedgerDecimalInput({ value, onChange, ...props }: Props) {
  const display = value?.startsWith('!') ? value.slice(1) : value == null ? '' : decimalText(value)
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={display}
      onChange={(event) => {
        const raw = event.target.value
        if (!raw) {
          onChange?.('')
          return
        }
        try {
          onChange?.(parseLocaleDecimal(raw))
        } catch {
          onChange?.('!' + raw)
        }
      }}
    />
  )
}
