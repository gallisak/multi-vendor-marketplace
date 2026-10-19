import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { NotificationsService } from './notifications.service.js';

class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'seller.approved' }) type: string;
  @ApiProperty({ type: Object }) payload: unknown;
  @ApiProperty({ nullable: true, type: Date }) readAt: Date | null;
  @ApiProperty() createdAt: Date;
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: [NotificationDto] })
  list(@CurrentUser() user: AuthUser): Promise<NotificationDto[]> {
    return this.notifications.recent(user.id);
  }
}
