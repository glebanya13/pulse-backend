import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@ApiTags('complaints')
@ApiBearerAuth()
@Controller('complaints')
export class ComplaintsController {
  constructor(private complaintsService: ComplaintsService) {}

  @Post()
  @ApiOperation({
    summary:
      'File a complaint about a user, an event, or a general support request (жалоба / обращение в поддержку)',
    description:
      'Not explicitly listed in the original API spec, added because the Complaint entity needs a way to be populated for the admin panel to have anything to review.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaintsService.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({
    summary:
      "List the current user's own filed complaints/support requests, newest first",
  })
  findMine(@CurrentUser() user: AuthUser) {
    return this.complaintsService.findMine(user.id);
  }
}
