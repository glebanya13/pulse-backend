import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CitiesService } from './cities.service';

@ApiTags('cities')
@Controller('cities')
export class CitiesController {
  constructor(private cities: CitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'BY + RU city catalog' })
  list() {
    return this.cities.list();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Single city by slug' })
  bySlug(@Param('slug') slug: string) {
    return this.cities.bySlug(slug);
  }
}
