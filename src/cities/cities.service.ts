import { Injectable, NotFoundException } from '@nestjs/common';
import { CITIES, findCity } from './cities.catalog';

@Injectable()
export class CitiesService {
  list() {
    return CITIES;
  }

  bySlug(slug: string) {
    const city = findCity(slug);
    if (!city) throw new NotFoundException('City not found');
    return city;
  }
}
