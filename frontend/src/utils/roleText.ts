export const roleText = (roles?: Array<string | { name?: string }>) =>
  roles?.map(role => typeof role === 'string' ? role : role.name).filter(Boolean).join(', ') || '—'
