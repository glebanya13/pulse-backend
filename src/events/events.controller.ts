import {
  Body,
  Controller,
  Delete,
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
import { Public } from '../common/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Public()
  @Get('events')
  @ApiOperation({
    summary:
      'List/search events (map & list). Public for guest browsing; JWT optional.',
  })
  findMany(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: QueryEventsDto,
  ) {
    return this.eventsService.findMany(query, user?.id);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a new event (you become its host)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  @Get('users/me/events')
  @ApiOperation({ summary: 'My events (as host)' })
  findMine(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.eventsService.findMine(user.id, pagination);
  }

  @Public()
  @Get('events/:id')
  @ApiOperation({ summary: 'Get a single event by id (public)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.eventsService.findOne(id, user?.id);
  }

  @Public()
  @Post('events/:id/view')
  @ApiOperation({ summary: 'Record a detail view (impression)' })
  recordView(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.eventsService.recordView(id, user?.id);
  }

  @Get('events/:id/stats')
  @ApiOperation({ summary: 'Host analytics for an event' })
  stats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.stats(id, user.id);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update an event (host only)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, user.id, dto);
  }

  @Post('events/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an event (host only) and notify applicants',
  })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.cancel(id, user.id);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Delete an event (host only)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.remove(id, user.id);
  }
}
