import { Injectable } from '@nestjs/common';
/** One priority rule for catalog defaults and customer-specific delivery prices.
 * Aliases are internal SQL identifiers, never request input. NULL means absent;
 * a configured zero is always retained. Group/customer prices use ledger THB.
 */
@Injectable()
export class LaborPricingService {
  sql(model: string, group: string, customerModel?: string, customerGroup?: string) {
    const choices: {amount:string;currency:string;source:string}[] = [];
    if (customerModel) choices.push({amount:`${customerModel}.labor_price_per_15g`,currency:"'THB'",source:'CUSTOMER'});
    if (customerGroup) choices.push({amount:`${customerGroup}.labor_price_per_15g`,currency:"'THB'",source:'GROUP'});
    choices.push({amount:`${model}.default_labor_price_per_15g`,currency:`${model}.default_labor_currency`,source:'MODEL'});
    choices.push({amount:`${group}.default_labor_price_per_15g`,currency:"'THB'",source:'GROUP_DEFAULT'});
    return {
      amount:`coalesce(${choices.map(c=>c.amount).join(',')})::text`,
      currency:`CASE ${choices.map(c=>`WHEN ${c.amount} IS NOT NULL THEN ${c.currency}`).join(' ')} ELSE NULL END`,
      source:`CASE ${choices.map(c=>`WHEN ${c.amount} IS NOT NULL THEN '${c.source}'`).join(' ')} ELSE 'NONE' END`,
    };
  }
  projection(model: string, group: string) {
    const result = this.sql(model,group);
    return `${result.amount} effective_labor_price_per_15g,${result.currency} effective_labor_currency,${result.source} labor_price_source`;
  }
}
