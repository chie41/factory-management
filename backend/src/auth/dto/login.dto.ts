import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({
    example: 'NhapMatKhauCuaBan',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}