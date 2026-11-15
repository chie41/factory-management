export type Customer = {
  id: string
  code?: string
  customerCode?: string
  name?: string
  fullName?: string
  phone?: string
  phoneNumber?: string
  address?: string
  status?: string
  note?: string
  createdAt?: string
}

export type CustomerInput = { name: string; phone?: string; address?: string; status: 'ACTIVE' | 'INACTIVE'; note?: string }
