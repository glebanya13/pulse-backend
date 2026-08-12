import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('applications')
@ApiBearerAuth()
@Controller()
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Post('events/:eventId/applications')
  @ApiOperation({
    summary: 'Apply to participate in an event (заявка на участие)',
  })
  apply(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.apply(eventId, user.id, dto);
  }

  @Get('events/:eventId/applications')
  @ApiOperation({ summary: 'List applications for an event (host only)' })
  listForEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applicationsService.listForEvent(eventId, user.id);
  }

  @Get('users/me/applications')
  @ApiOperation({
    summary: 'My applications (мои заявки) — events I applied to',
  })
  myApplications(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.applicationsService.myApplications(user.id, pagination);
  }

  @Get('users/me/hosted-applications')
  @ApiOperation({
    summary:
      'Pending applications across all events I host (входящие заявки)',
  })
  hostedPending(@CurrentUser() user: AuthUser) {
    return this.applicationsService.hostedPending(user.id);
  }

  @Patch('applications/:id')
  @ApiOperation({ summary: 'Accept or reject an application (host only)' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.updateStatus(id, user.id, dto);
  }

  @Post('applications/:id/confirm-attendance')
  @ApiOperation({
    summary:
      'Confirm attendance after the event (guest confirms self; host confirms guest)',
  })
  confirmAttendance(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.applicationsService.confirmAttendance(id, user.id);
  }

  @Post('applications/:id/mark-no-show')
  @ApiOperation({
    summary:
      'Host marks an accepted in-person guest as a no-show after the event',
  })
  markNoShow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.applicationsService.markNoShow(id, user.id);
  }

  @Post('applications/:id/clear-no-show')
  @ApiOperation({
    summary: 'Host clears a mistaken no-show mark (within 48h window)',
  })
  clearNoShow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.applicationsService.clearNoShow(id, user.id);
  }
}
