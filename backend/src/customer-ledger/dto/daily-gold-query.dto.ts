import { IsIn, Matches } from 'class-validator';
export class DailyGoldQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @IsIn(['all','debt'])
  scope: 'all' | 'debt' = 'all';
}
