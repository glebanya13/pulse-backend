import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post('events/:eventId/reviews')
  @ApiOperation({
    summary:
      'Leave a review for another participant of this event (two-sided rating system)',
  })
  create(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(eventId, user.id, dto);
  }

  @Get('users/:userId/reviews')
  @ApiOperation({ summary: 'List reviews received by a user' })
  findForUser(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.reviewsService.findForUser(userId, pagination);
  }
}
