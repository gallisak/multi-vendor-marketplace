import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';

export class PublicUser {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'customer@mvm.local' })
  email: string;

  @ApiProperty({ example: 'Customer' })
  name: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;
}
