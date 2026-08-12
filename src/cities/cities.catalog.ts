export type CityCountry = 'BY' | 'RU';
export type CityCurrency = 'BYN' | 'RUB';

export interface CityDef {
  slug: string;
  name: string;
  country: CityCountry;
  currency: CityCurrency;
  lat: number;
  lng: number;
}

/** Shared BY + RU city catalog (source of truth for API + Event.citySlug). */
export const CITIES: CityDef[] = [
  // Belarus
  { slug: 'minsk', name: 'Минск', country: 'BY', currency: 'BYN', lat: 53.9023, lng: 27.5619 },
  { slug: 'brest', name: 'Брест', country: 'BY', currency: 'BYN', lat: 52.0976, lng: 23.7341 },
  { slug: 'grodno', name: 'Гродно', country: 'BY', currency: 'BYN', lat: 53.6884, lng: 23.8258 },
  { slug: 'gomel', name: 'Гомель', country: 'BY', currency: 'BYN', lat: 52.4345, lng: 30.9754 },
  { slug: 'vitebsk', name: 'Витебск', country: 'BY', currency: 'BYN', lat: 55.1904, lng: 30.2049 },
  { slug: 'mogilev', name: 'Могилёв', country: 'BY', currency: 'BYN', lat: 53.9007, lng: 30.3314 },
  { slug: 'bobruisk', name: 'Бобруйск', country: 'BY', currency: 'BYN', lat: 53.1384, lng: 29.2214 },
  { slug: 'baranovichi', name: 'Барановичи', country: 'BY', currency: 'BYN', lat: 53.1327, lng: 26.0139 },
  { slug: 'borisov', name: 'Борисов', country: 'BY', currency: 'BYN', lat: 54.2279, lng: 28.505 },
  { slug: 'pinsk', name: 'Пинск', country: 'BY', currency: 'BYN', lat: 52.1229, lng: 26.0951 },
  { slug: 'orsha', name: 'Орша', country: 'BY', currency: 'BYN', lat: 54.5081, lng: 30.4258 },
  { slug: 'mozyr', name: 'Мозырь', country: 'BY', currency: 'BYN', lat: 52.0495, lng: 29.2456 },
  { slug: 'soligorsk', name: 'Солигорск', country: 'BY', currency: 'BYN', lat: 52.7876, lng: 27.5415 },
  { slug: 'novopolotsk', name: 'Новополоцк', country: 'BY', currency: 'BYN', lat: 55.5318, lng: 28.643 },
  { slug: 'lida', name: 'Лида', country: 'BY', currency: 'BYN', lat: 53.8833, lng: 25.2997 },

  // Russia — major cities
  { slug: 'moscow', name: 'Москва', country: 'RU', currency: 'RUB', lat: 55.7558, lng: 37.6173 },
  { slug: 'saint-petersburg', name: 'Санкт-Петербург', country: 'RU', currency: 'RUB', lat: 59.9343, lng: 30.3351 },
  { slug: 'novosibirsk', name: 'Новосибирск', country: 'RU', currency: 'RUB', lat: 55.0084, lng: 82.9357 },
  { slug: 'yekaterinburg', name: 'Екатеринбург', country: 'RU', currency: 'RUB', lat: 56.8389, lng: 60.6057 },
  { slug: 'kazan', name: 'Казань', country: 'RU', currency: 'RUB', lat: 55.7961, lng: 49.1064 },
  { slug: 'nizhny-novgorod', name: 'Нижний Новгород', country: 'RU', currency: 'RUB', lat: 56.2965, lng: 43.9361 },
  { slug: 'chelyabinsk', name: 'Челябинск', country: 'RU', currency: 'RUB', lat: 55.1644, lng: 61.4368 },
  { slug: 'samara', name: 'Самара', country: 'RU', currency: 'RUB', lat: 53.1959, lng: 50.1002 },
  { slug: 'omsk', name: 'Омск', country: 'RU', currency: 'RUB', lat: 54.9885, lng: 73.3242 },
  { slug: 'rostov-on-don', name: 'Ростов-на-Дону', country: 'RU', currency: 'RUB', lat: 47.2357, lng: 39.7015 },
  { slug: 'ufa', name: 'Уфа', country: 'RU', currency: 'RUB', lat: 54.7388, lng: 55.9721 },
  { slug: 'krasnoyarsk', name: 'Красноярск', country: 'RU', currency: 'RUB', lat: 56.0153, lng: 92.8932 },
  { slug: 'voronezh', name: 'Воронеж', country: 'RU', currency: 'RUB', lat: 51.672, lng: 39.1843 },
  { slug: 'perm', name: 'Пермь', country: 'RU', currency: 'RUB', lat: 58.0105, lng: 56.2502 },
  { slug: 'volgograd', name: 'Волгоград', country: 'RU', currency: 'RUB', lat: 48.708, lng: 44.5133 },
  { slug: 'krasnodar', name: 'Краснодар', country: 'RU', currency: 'RUB', lat: 45.0355, lng: 38.9753 },
  { slug: 'saratov', name: 'Саратов', country: 'RU', currency: 'RUB', lat: 51.5336, lng: 46.0343 },
  { slug: 'tyumen', name: 'Тюмень', country: 'RU', currency: 'RUB', lat: 57.1522, lng: 65.5272 },
  { slug: 'tolyatti', name: 'Тольятти', country: 'RU', currency: 'RUB', lat: 53.5303, lng: 49.3461 },
  { slug: 'izhevsk', name: 'Ижевск', country: 'RU', currency: 'RUB', lat: 56.8527, lng: 53.2115 },
  { slug: 'barnaul', name: 'Барнаул', country: 'RU', currency: 'RUB', lat: 53.3548, lng: 83.7698 },
  { slug: 'ulyanovsk', name: 'Ульяновск', country: 'RU', currency: 'RUB', lat: 54.3142, lng: 48.4031 },
  { slug: 'irkutsk', name: 'Иркутск', country: 'RU', currency: 'RUB', lat: 52.2869, lng: 104.305 },
  { slug: 'khabarovsk', name: 'Хабаровск', country: 'RU', currency: 'RUB', lat: 48.4827, lng: 135.0838 },
  { slug: 'yaroslavl', name: 'Ярославль', country: 'RU', currency: 'RUB', lat: 57.6261, lng: 39.8845 },
  { slug: 'vladivostok', name: 'Владивосток', country: 'RU', currency: 'RUB', lat: 43.1198, lng: 131.8869 },
  { slug: 'makhachkala', name: 'Махачкала', country: 'RU', currency: 'RUB', lat: 42.9849, lng: 47.5047 },
  { slug: 'tomsk', name: 'Томск', country: 'RU', currency: 'RUB', lat: 56.4846, lng: 84.9476 },
  { slug: 'orenburg', name: 'Оренбург', country: 'RU', currency: 'RUB', lat: 51.7727, lng: 55.0988 },
  { slug: 'kemerovo', name: 'Кемерово', country: 'RU', currency: 'RUB', lat: 55.3549, lng: 86.0873 },
  { slug: 'novokuznetsk', name: 'Новокузнецк', country: 'RU', currency: 'RUB', lat: 53.7596, lng: 87.1216 },
  { slug: 'ryazan', name: 'Рязань', country: 'RU', currency: 'RUB', lat: 54.6292, lng: 39.7359 },
  { slug: 'naberezhnye-chelny', name: 'Набережные Челны', country: 'RU', currency: 'RUB', lat: 55.7436, lng: 52.3958 },
  { slug: 'astrakhan', name: 'Астрахань', country: 'RU', currency: 'RUB', lat: 46.3497, lng: 48.0408 },
  { slug: 'penza', name: 'Пенза', country: 'RU', currency: 'RUB', lat: 53.2001, lng: 45.0046 },
  { slug: 'lipetsk', name: 'Липецк', country: 'RU', currency: 'RUB', lat: 52.6031, lng: 39.5708 },
  { slug: 'kirov', name: 'Киров', country: 'RU', currency: 'RUB', lat: 58.6035, lng: 49.668 },
  { slug: 'cheboksary', name: 'Чебоксары', country: 'RU', currency: 'RUB', lat: 56.1439, lng: 47.2489 },
  { slug: 'kaliningrad', name: 'Калининград', country: 'RU', currency: 'RUB', lat: 54.7104, lng: 20.4522 },
  { slug: 'tula', name: 'Тула', country: 'RU', currency: 'RUB', lat: 54.1931, lng: 37.6173 },
  { slug: 'kursk', name: 'Курск', country: 'RU', currency: 'RUB', lat: 51.7373, lng: 36.1873 },
  { slug: 'stavropol', name: 'Ставрополь', country: 'RU', currency: 'RUB', lat: 45.0428, lng: 41.9734 },
  { slug: 'sochi', name: 'Сочи', country: 'RU', currency: 'RUB', lat: 43.6028, lng: 39.7342 },
  { slug: 'tver', name: 'Тверь', country: 'RU', currency: 'RUB', lat: 56.8587, lng: 35.9176 },
  { slug: 'ivanovo', name: 'Иваново', country: 'RU', currency: 'RUB', lat: 56.9972, lng: 40.9714 },
  { slug: 'bryansk', name: 'Брянск', country: 'RU', currency: 'RUB', lat: 53.2434, lng: 34.3634 },
  { slug: 'belgorod', name: 'Белгород', country: 'RU', currency: 'RUB', lat: 50.5954, lng: 36.5873 },
  { slug: 'vladimir', name: 'Владимир', country: 'RU', currency: 'RUB', lat: 56.129, lng: 40.4066 },
  { slug: 'arkhangelsk', name: 'Архангельск', country: 'RU', currency: 'RUB', lat: 64.5393, lng: 40.5187 },
  { slug: 'kaluga', name: 'Калуга', country: 'RU', currency: 'RUB', lat: 54.5293, lng: 36.2754 },
  { slug: 'smolensk', name: 'Смоленск', country: 'RU', currency: 'RUB', lat: 54.7826, lng: 32.0453 },
  { slug: 'cherepovets', name: 'Череповец', country: 'RU', currency: 'RUB', lat: 59.1323, lng: 37.9092 },
  { slug: 'saransk', name: 'Саранск', country: 'RU', currency: 'RUB', lat: 54.1874, lng: 45.1839 },
  { slug: 'vologda', name: 'Вологда', country: 'RU', currency: 'RUB', lat: 59.2205, lng: 39.8915 },
  { slug: 'yakutsk', name: 'Якутск', country: 'RU', currency: 'RUB', lat: 62.0355, lng: 129.6755 },
  { slug: 'grozny', name: 'Грозный', country: 'RU', currency: 'RUB', lat: 43.3178, lng: 45.6982 },
];

const bySlug = new Map(CITIES.map((c) => [c.slug, c]));

export function findCity(slug: string): CityDef | undefined {
  return bySlug.get(slug);
}

export function assertCitySlug(slug: string): CityDef {
  const city = findCity(slug);
  if (!city) {
    throw new Error(`Unknown city slug: ${slug}`);
  }
  return city;
}

export function isKnownCitySlug(slug: string): boolean {
  return bySlug.has(slug);
}
