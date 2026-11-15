
import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
  } from 'class-validator';
  
  import {
    ApiProperty,
    ApiPropertyOptional,
  } from '@nestjs/swagger';
  
  export class CreateCustomerDto {
    @ApiPropertyOptional({ description: 'Confirmation token returned with CUSTOMER_NAME_DUPLICATE' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    duplicate_name_confirmation?: string;

    @ApiProperty({
      example: 'Khách hàng thử nghiệm',
      maxLength: 180,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(180)
    name!: string;
  
    @ApiPropertyOptional({
      example: '02012345678',
      maxLength: 30,
    })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    phone?: string;
  
    @ApiPropertyOptional({ example: 'Vientiane' })
    @IsOptional()
    @IsString()
    address?: string;
  
    @ApiPropertyOptional({
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    })
    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: 'ACTIVE' | 'INACTIVE';
  
    @ApiPropertyOptional({
      example: 'Khách hàng thường xuyên',
    })
    @IsOptional()
    @IsString()
    note?: string;
  }
  
