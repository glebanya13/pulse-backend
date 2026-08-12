import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { MonetizationService } from './monetization.service';

@ApiTags('monetization')
@ApiBearerAuth()
@Controller()
export class MonetizationController {
  constructor(private monetization: MonetizationService) {}

  @Public()
  @Get('monetization/catalog')
  @ApiOperation({ summary: 'Product catalog (boost + Organizer Pro)' })
  catalog() {
    return this.monetization.catalog();
  }

  @Post('events/:id/boost')
  @ApiOperation({ summary: 'Create PENDING payment to boost an event' })
  boost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('currency') currency?: string,
  ) {
    return this.monetization.createEventBoost(user.id, id, currency);
  }

  @Post('users/me/organizer-pro')
  @ApiOperation({ summary: 'Create PENDING payment for Organizer Pro' })
  organizerPro(
    @CurrentUser() user: AuthUser,
    @Query('currency') currency?: string,
  ) {
    return this.monetization.createOrganizerPro(user.id, currency);
  }
}
