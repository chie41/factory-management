export type GoldBox = { id: string; name: string; tareG: string }
export type GoldLayoutTemplate = {
  boxes: GoldBox[]
  bagWeights: string[]
  labelWeights: string[]
}
export type GoldTemplateVersion = {
  effectiveFrom: string
  template: GoldLayoutTemplate
}
export const INITIAL_GOLD_TEMPLATE: GoldLayoutTemplate = {
  boxes: [{ id: 'box-01', name: 'Hộp 01', tareG: '455.00' }],
  bagWeights: ['1.20', '1.80', '1.60', '2.20', '0.90'],
  labelWeights: ['', '', '', '', '', ''],
}
export function cloneGoldTemplate(template: GoldLayoutTemplate): GoldLayoutTemplate {
  return {
    boxes: template.boxes.map(box => ({ ...box })),
    bagWeights: [...template.bagWeights],
    labelWeights: [...template.labelWeights],
  }
}
export function effectiveGoldTemplate(versions: GoldTemplateVersion[], date: string): GoldLayoutTemplate {
  const eligible = versions.filter(version => version.effectiveFrom <= date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return cloneGoldTemplate((eligible.at(-1)?.template ?? INITIAL_GOLD_TEMPLATE))
}
/** Rules are inclusive, and a later dated version overrides earlier defaults.
 * A day-only override does not create a new default template version.
 * Existing day drafts remain frozen until the operator explicitly changes their layout.
 */
export function upsertTemplateVersion(
  versions: GoldTemplateVersion[],
  version: GoldTemplateVersion,
): GoldTemplateVersion[] {
  return [...versions.filter(item => item.effectiveFrom !== version.effectiveFrom), {
    effectiveFrom: version.effectiveFrom,
    template: cloneGoldTemplate(version.template),
  }].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}
