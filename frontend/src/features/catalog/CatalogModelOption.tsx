import { CatalogImage } from './CatalogImage'
import './catalog-model-option.css'

/** Shared model identity for dropdown options and selected values. */
export function CatalogModelOption({ model, size = 30, strong = false }: { size?: number; strong?: boolean; model: { name: string; code: string; image_url?: string | null } }) {
  return <span className="catalog-model-option">
    <span className="catalog-model-option-thumbnail" style={{ width: size, height: size }}><CatalogImage value={model.image_url} size={size} thumbnail /></span>
    <span className="catalog-model-option-text"><strong style={strong ? {fontWeight:600} : undefined}>{model.name}</strong><small>{model.code}</small></span>
  </span>
}
