import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AdminService } from './admin.service';
import { BlockUserDto } from './dto/block-user.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { SetTransactionStatusDto } from './dto/set-transaction-status.dto';
import { SetAuthorOfMonthDto } from './dto/set-author-of-month.dto';
import { SetSpecialProjectDto } from './dto/set-special-project.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: '[admin] List all users' })
  listUsers(@Query() pagination: PaginationDto) {
    return this.adminService.listUsers(pagination);
  }

  @Patch('users/:id/block')
  @ApiOperation({ summary: '[admin] Block or unblock a user' })
  blockUser(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.adminService.blockUser(admin.id, id, dto);
  }

  @Patch('users/:id/special-project')
  @ApiOperation({ summary: '[admin] Invite / revoke special-project flag' })
  setSpecialProject(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetSpecialProjectDto,
  ) {
    return this.adminService.setSpecialProject(admin.id, id, dto);
  }

  @Get('authors/pool')
  @ApiOperation({ summary: '[admin] Talent pool for author-of-month (L5+)' })
  authorPool() {
    return this.adminService.authorPool();
  }

  @Get('authors/month')
  @ApiOperation({ summary: '[admin] Current author of the month' })
  currentAuthorOfMonth() {
    return this.adminService.currentAuthorOfMonth();
  }

  @Post('authors/month')
  @ApiOperation({ summary: '[admin] Set author of the month' })
  setAuthorOfMonth(
    @CurrentUser() admin: AuthUser,
    @Body() dto: SetAuthorOfMonthDto,
  ) {
    return this.adminService.setAuthorOfMonth(admin.id, dto);
  }

  @Get('events')
  @ApiOperation({ summary: '[admin] List all events (optional ?status=)' })
  listEvents(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.adminService.listEvents(pagination, status);
  }

  @Patch('events/:id/cancel')
  @ApiOperation({ summary: '[admin] Cancel/hide any event regardless of host' })
  cancelEvent(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.adminService.cancelEvent(admin.id, id);
  }

  @Post('events/:id/approve')
  @ApiOperation({ summary: '[admin] Approve PENDING_REVIEW event' })
  approveEvent(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.adminService.approveEvent(admin.id, id);
  }

  @Post('events/:id/reject')
  @ApiOperation({ summary: '[admin] Reject PENDING_REVIEW event' })
  rejectEvent(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.adminService.rejectEvent(admin.id, id);
  }

  @Post('events/:id/boost')
  @ApiOperation({ summary: '[admin] Manually boost an event (no payment)' })
  boostEvent(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() body: { days?: number },
  ) {
    return this.adminService.boostEvent(admin.id, id, body?.days ?? 7);
  }

  @Post('users/:id/organizer-pro')
  @ApiOperation({ summary: '[admin] Manually grant Organizer Pro (no payment)' })
  grantOrganizerPro(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() body: { days?: number },
  ) {
    return this.adminService.grantOrganizerPro(admin.id, id, body?.days ?? 30);
  }

  @Get('complaints')
  @ApiOperation({ summary: '[admin] List all complaints' })
  listComplaints(@Query() pagination: PaginationDto) {
    return this.adminService.listComplaints(pagination);
  }

  @Patch('complaints/:id')
  @ApiOperation({ summary: '[admin] Resolve or dismiss a complaint' })
  updateComplaint(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateComplaintDto,
  ) {
    return this.adminService.updateComplaint(admin.id, id, dto);
  }

  @Delete('reviews/:id')
  @ApiOperation({
    summary:
      '[admin] Delete an inappropriate review (recomputes the target rating)',
  })
  deleteReview(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.adminService.deleteReview(admin.id, id);
  }

  @Patch('transactions/:id')
  @ApiOperation({
    summary: '[admin] Force a DEV-mode transaction to SUCCESS or FAILED',
  })
  setTransactionStatus(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetTransactionStatusDto,
  ) {
    return this.adminService.setTransactionStatus(admin.id, id, dto.status);
  }

  @Get('logs')
  @ApiOperation({ summary: '[admin] Audit trail of admin actions' })
  listLogs(@Query() pagination: PaginationDto) {
    return this.adminService.listLogs(pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: '[admin] Aggregate platform counts' })
  stats() {
    return this.adminService.stats();
  }
}
