import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PlacesService } from './places.service';
import { PlaceReviewsService } from './place-reviews.service';
import { CreatePlaceReviewDto } from './dto/create-place-review.dto';
import { UpsertPlaceDto } from './dto/upsert-place.dto';

@ApiTags('places')
@ApiBearerAuth()
@Controller()
export class PlacesController {
  constructor(
    private places: PlacesService,
    private placeReviews: PlaceReviewsService,
  ) {}

  @Public()
  @Get('places/:id')
  @ApiOperation({ summary: 'Place card with reviews and upcoming events' })
  findOne(@Param('id') id: string) {
    return this.places.findOne(id);
  }

  @Post('places/upsert')
  @ApiOperation({ summary: 'Create or merge a place from map search' })
  async upsert(@Body() dto: UpsertPlaceDto) {
    const place = await this.places.upsertFromGeo({
      name: dto.name,
      address: dto.address,
      lat: dto.lat,
      lng: dto.lng,
      citySlug: dto.citySlug ?? 'minsk',
      externalId: dto.externalId,
    });
    if (!place) {
      throw new BadRequestException('Could not create place');
    }
    return place;
  }

  @Post('places/:id/reviews')
  @ApiOperation({ summary: 'Review a place after attending an event there' })
  createReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreatePlaceReviewDto,
  ) {
    return this.placeReviews.create(user.id, id, dto);
  }

  @Get('events/:eventId/place-review/mine')
  @ApiOperation({ summary: 'My place review for an event (if any)' })
  mineForEvent(
    @CurrentUser() user: AuthUser,
    @Param('eventId') eventId: string,
  ) {
    return this.placeReviews.mineForEvent(user.id, eventId);
  }
}
