import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { PublicUser } from '../users/user.dto.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'new.customer@mvm.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'Password123!' })
  @IsString()
  @Length(8, 128)
  password: string;

  @ApiProperty({ example: 'New Customer' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name: string;
}

export class LoginDto {
  @ApiProperty({ example: 'customer@mvm.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn: number;

  @ApiProperty({ type: PublicUser })
  user: PublicUser;
}

export class AuthProvidersDto {
  @ApiProperty()
  password: boolean;

  @ApiProperty({ description: 'False when Google OAuth credentials are not configured' })
  google: boolean;
}
