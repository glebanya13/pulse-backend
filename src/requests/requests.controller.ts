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
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequestsService } from './requests.service';
import { CreateGuestRequestDto } from './dto/create-guest-request.dto';
import { UpdateGuestRequestDto } from './dto/update-guest-request.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

@ApiTags('requests')
@ApiBearerAuth()
@Controller()
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @Get('requests')
  @ApiOperation({
    summary:
      'List guest requests (filter by type=GENERAL|PERSONAL). Personal requests are only visible to author/target host.',
  })
  findMany(@CurrentUser() user: AuthUser, @Query() query: QueryRequestsDto) {
    return this.requestsService.findMany(user.id, query);
  }

  @Post('requests')
  @ApiOperation({
    summary: 'Create a guest request (e.g. "Ищу компанию на ужин")',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGuestRequestDto) {
    return this.requestsService.create(user.id, dto);
  }

  @Get('users/me/requests')
  @ApiOperation({ summary: 'My guest requests' })
  myRequests(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.requestsService.myRequests(user.id, pagination);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get a single guest request with its offers' })
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  @Patch('requests/:id')
  @ApiOperation({ summary: 'Update a guest request (author only)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateGuestRequestDto,
  ) {
    return this.requestsService.update(id, user.id, dto);
  }

  @Post('requests/:id/offers')
  @ApiOperation({ summary: 'Offer to fulfil a guest request (host action)' })
  createOffer(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOfferDto,
  ) {
    return this.requestsService.createOffer(id, user.id, dto);
  }

  @Patch('request-offers/:id')
  @ApiOperation({ summary: 'Accept or decline an offer (request author only)' })
  updateOffer(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.requestsService.updateOfferStatus(id, user.id, dto);
  }

  @Delete('request-offers/:id')
  @ApiOperation({
    summary: 'Withdraw my own pending offer (offering host only)',
  })
  withdrawOffer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requestsService.withdrawOffer(id, user.id);
  }
}
