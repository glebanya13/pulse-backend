import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller()
export class FavoritesController {
  constructor(private favoritesService: FavoritesService) {}

  @Get('favorites')
  @ApiOperation({ summary: 'My favorited events' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.favoritesService.findMine(user.id);
  }

  @Post('favorites/:eventId')
  @ApiOperation({ summary: 'Add an event to favorites (idempotent)' })
  add(@CurrentUser() user: AuthUser, @Param('eventId') eventId: string) {
    return this.favoritesService.add(user.id, eventId);
  }

  @Delete('favorites/:eventId')
  @ApiOperation({ summary: 'Remove an event from favorites (idempotent)' })
  remove(@CurrentUser() user: AuthUser, @Param('eventId') eventId: string) {
    return this.favoritesService.remove(user.id, eventId);
  }
}
