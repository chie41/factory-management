// Select explicitly; never retry a mutation against a different endpoint.
export const documentedContract = import.meta.env.VITE_API_CONTRACT === 'documented'
