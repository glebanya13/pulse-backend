import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { PlaceReviewsService } from './place-reviews.service';

@Module({
  controllers: [PlacesController],
  providers: [PlacesService, PlaceReviewsService],
  exports: [PlacesService],
})
export class PlacesModule {}
