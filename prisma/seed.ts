/* eslint-disable no-console */
import {
  ApplicationStatus,
  ComplaintStatus,
  ComplaintTargetType,
  EventFormat,
  EventStatus,
  GenderRequirement,
  GuestRequestStatus,
  GuestRequestType,
  NotificationType,
  PickupMethod,
  PrismaClient,
  PriceType,
  RequestOfferStatus,
  ReviewTargetRole,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic placeholder photos under seed-assets/
const avatar = (seed: string) => `/seed-assets/${seed}-avatar.jpg`;
const photo = (seed: string) => `/seed-assets/${seed}-photo.jpg`;

async function upsertUser(data: {
  phone: string;
  name: string;
  age: number;
  city: string;
  bio?: string;
  whatICook?: string;
  socialLinks?: Record<string, string>;
  rating: number;
  eventsCount?: number;
  reviewsCount?: number;
  avatarSeed: string;
  photoSeeds?: string[];
  isAdmin?: boolean;
  role?: Role;
}) {
  return prisma.user.upsert({
    where: { phone: data.phone },
    update: {},
    create: {
      phone: data.phone,
      phoneVerified: true,
      name: data.name,
      age: data.age,
      city: data.city,
      bio: data.bio,
      whatICook: data.whatICook,
      socialLinks: data.socialLinks ?? undefined,
      rating: data.rating,
      eventsCount: data.eventsCount ?? 0,
      reviewsCount: data.reviewsCount ?? 0,
      avatarUrl: avatar(data.avatarSeed),
      photos: (data.photoSeeds ?? []).map(photo),
      isAdmin: data.isAdmin ?? false,
      role: data.role ?? (data.isAdmin ? Role.ADMIN : Role.USER),
    },
  });
}

async function main() {
  console.log('Seeding Пульс database...');

  await prisma.user.deleteMany();

  // ---------------------------------------------------------------------
  // Users — Минск
  // ---------------------------------------------------------------------
  const marina = await upsertUser({
    phone: '+375291112233',
    name: 'Марина',
    age: 27,
    city: 'Минск',
    bio: 'Организую клубные вечеринки и open-air. Следите за афишей в Пульсе.',
    whatICook: 'DJ sets, house, techno',
    socialLinks: {
      instagram: 'marina.pulse.minsk',
      telegram: '@marina_pulse',
    },
    rating: 98,
    eventsCount: 24,
    reviewsCount: 19,
    avatarSeed: 'maria-vgosti',
    photoSeeds: ['maria-1', 'maria-2', 'maria-3'],
    role: Role.PERFORMER,
  });

  const denis = await upsertUser({
    phone: '+375297654321',
    name: 'Денис',
    age: 32,
    city: 'Минск',
    bio: 'Концертный промоутер. Большие площадки и камерные шоу.',
    whatICook: 'Live shows, hip-hop, indie',
    socialLinks: {
      telegram: 'denis_shows',
      instagram: 'denis.shows.by',
    },
    rating: 95,
    eventsCount: 15,
    reviewsCount: 12,
    avatarSeed: 'dmitry-vgosti',
    photoSeeds: ['dmitry-1', 'dmitry-2'],
    role: Role.PERFORMER,
  });

  const kate = await upsertUser({
    phone: '+375333334455',
    name: 'Катя',
    age: 24,
    city: 'Минск',
    bio: 'Stand-up, квизы и камерные вечера в барах Верхнего города.',
    whatICook: 'Stand-up, quiz nights',
    rating: 92,
    eventsCount: 8,
    reviewsCount: 7,
    avatarSeed: 'anna-vgosti',
    photoSeeds: ['anna-1'],
    role: Role.PERFORMER,
  });

  const alex = await upsertUser({
    phone: '+375291555599',
    name: 'Алексей',
    age: 29,
    city: 'Минск',
    bio: 'Люблю концерты и ночные сеты. Часто хожу с друзьями.',
    rating: 88,
    eventsCount: 3,
    reviewsCount: 5,
    avatarSeed: 'alexey-vgosti',
  });

  const olga = await upsertUser({
    phone: '+375336667788',
    name: 'Ольга',
    age: 26,
    city: 'Минск',
    bio: 'Ищу, куда сходить в пятницу: от джаза до techno.',
    rating: 90,
    eventsCount: 2,
    reviewsCount: 4,
    avatarSeed: 'olga-vgosti',
  });

  const igor = await upsertUser({
    phone: '+375297778899',
    name: 'Игорь',
    age: 34,
    city: 'Минск',
    bio: 'Фотограф мероприятий, всегда в курсе афиши.',
    rating: 85,
    eventsCount: 0,
    reviewsCount: 1,
    avatarSeed: 'igor-vgosti',
  });

  const admin = await upsertUser({
    phone: '+375290000000',
    name: 'Администратор',
    age: 35,
    city: 'Минск',
    rating: 100,
    avatarSeed: 'admin-vgosti',
    isAdmin: true,
    role: Role.ADMIN,
  });

  const testUser = await upsertUser({
    phone: '+375290000001',
    name: 'Алексей',
    age: 30,
    city: 'Минск',
    bio: 'Тестовый аккаунт роли USER.',
    rating: 100,
    avatarSeed: 'test-user-vgosti',
    role: Role.USER,
  });

  const testPerformer = await upsertUser({
    phone: '+375290000002',
    name: 'Марина',
    age: 28,
    city: 'Минск',
    bio: 'Тестовый аккаунт организатора.',
    whatICook: 'Клубные вечеринки',
    rating: 100,
    avatarSeed: 'test-performer-vgosti',
    role: Role.PERFORMER,
  });

  // ---------------------------------------------------------------------
  // Badges
  // ---------------------------------------------------------------------
  const badgeDefs = [
    { code: 'FIRST_EVENT', title: 'Первое событие', description: 'Провёл своё первое мероприятие', iconUrl: '🎉' },
    { code: 'TOP_HOST', title: 'Топ организатор', description: 'Рейтинг 90+ при 5 и более отзывах', iconUrl: '👑' },
    { code: 'GUEST_FAVORITE', title: 'Любимец публики', description: 'Рейтинг 95+ при 3 и более отзывах', iconUrl: '⭐' },
    { code: 'TASTE_MASTER', title: 'Чувствует вайб', description: 'Средний «вкус» 92+ по 3+ отзывам', iconUrl: '🎧' },
    { code: 'MASTER_COZY', title: 'Атмосфера огня', description: 'Средняя атмосфера 90+ по 3+ отзывам', iconUrl: '✨' },
    { code: 'WARM_WELCOME', title: 'Гостеприимный хост', description: 'Среднее гостеприимство 90+ по 3+ отзывам', iconUrl: '🤗' },
    { code: 'SOUL_OF_PARTY', title: 'Душа тусовки', description: 'Средняя общительность 90+ по 3+ отзывам', iconUrl: '🪩' },
    { code: 'VIBE_MASTER', title: 'Идеальный вайб', description: 'Средний вайб / уникальность 90+ по 3+ отзывам', iconUrl: '💜' },
    { code: 'CLOCKWORK_HOST', title: 'Без хаоса', description: 'Средняя организация 90+ по 3+ отзывам', iconUrl: '⏱️' },
    { code: 'SPOTLESS_HOST', title: 'Чистая площадка', description: 'Средняя чистота 90+ по 3+ отзывам', iconUrl: '✨' },
    { code: 'BORSCHT_KING', title: 'Король арены', description: 'Большие концерты с высоким рейтингом', iconUrl: '🏟️' },
    { code: 'TOM_YUM_KING', title: 'Ночной король', description: 'Клубные сеты с высоким рейтингом', iconUrl: '🌙' },
    { code: 'PUNCTUAL_GUEST', title: 'Пунктуальный гость', description: 'Средняя пунктуальность 90+ по 3+ отзывам как гостя', iconUrl: '⏰' },
    { code: 'POLITE_GUEST', title: 'Вежливый гость', description: 'Средняя вежливость 90+ по 3+ отзывам как гостя', iconUrl: '🙏' },
    { code: 'GREAT_GUEST', title: 'Желаемый гость', description: 'Рейтинг 90+ при 3 и более отзывах как гостя', iconUrl: '✨' },
    { code: 'SOUL_GUEST', title: 'Душа компании', description: 'Средняя коммуникабельность 90+ по 3+ отзывам как гостя', iconUrl: '💬' },
  ];
  const badges: Record<string, { id: string }> = {};
  for (const b of badgeDefs) {
    badges[b.code] = await prisma.badge.upsert({
      where: { code: b.code },
      update: { title: b.title, description: b.description, iconUrl: b.iconUrl },
      create: b,
    });
  }

  await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId: marina.id, badgeId: badges.TOP_HOST.id } },
    update: {},
    create: { userId: marina.id, badgeId: badges.TOP_HOST.id },
  });
  await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId: marina.id, badgeId: badges.GUEST_FAVORITE.id } },
    update: {},
    create: { userId: marina.id, badgeId: badges.GUEST_FAVORITE.id },
  });
  await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId: denis.id, badgeId: badges.WARM_WELCOME.id } },
    update: {},
    create: { userId: denis.id, badgeId: badges.WARM_WELCOME.id },
  });
  await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId: kate.id, badgeId: badges.FIRST_EVENT.id } },
    update: {},
    create: { userId: kate.id, badgeId: badges.FIRST_EVENT.id },
  });

  // ---------------------------------------------------------------------
  // Events — Минск (даты относительно now, чтобы «Сегодня» всегда живое)
  // ---------------------------------------------------------------------
  const dayAt = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  /** Next weekday: 0=Sun … 5=Fri 6=Sat. If today is that day, pick next week. */
  const nextDow = (dow: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const add = (dow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const today = (h: number, m = 0) => dayAt(0, h, m);
  const tomorrow = (h: number, m = 0) => dayAt(1, h, m);
  const yesterday = (h: number, m = 0) => dayAt(-1, h, m);
  const friday = (h: number, m = 0) => nextDow(5, h, m);
  const saturday = (h: number, m = 0) => nextDow(6, h, m);

  // --- Сегодня ---
  const quizToday = await prisma.event.create({
    data: {
      hostId: kate.id,
      format: EventFormat.IN_PERSON,
      title: 'Квиз в баре · Вечерний раунд',
      description: 'Команды до 6 человек. Регистрация на месте. Напитки и призы.',
      photos: [photo('game-1')],
      tags: ['Квиз', 'Бар', 'Игры'],
      startAt: today(18, 0),
      endAt: today(21, 0),
      address: 'Минск, ул. Зыбицкая, 6',
      lat: 53.9048,
      lng: 27.5562,
      minGuests: 8,
      maxGuests: 48,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 15,
      requirementGender: GenderRequirement.ANY,
      status: EventStatus.ACTIVE,
    },
  });

  const jazz = await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.IN_PERSON,
      title: 'Джаз в Верхнем городе',
      description: 'Живой джаз, вино и мягкий свет. Камерный вечер.',
      photos: [photo('wine-1')],
      tags: ['Джаз', 'Live', 'Бар'],
      startAt: today(20, 0),
      endAt: today(23, 0),
      address: 'Минск, пл. Свободы, 23',
      lat: 53.9040,
      lng: 27.5550,
      minGuests: 8,
      maxGuests: 40,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 25,
      requirementGender: GenderRequirement.ANY,
      requirementInterests: ['Джаз', 'Live'],
      status: EventStatus.ACTIVE,
    },
  });

  const technoNight = await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.IN_PERSON,
      title: 'Techno Night · Pulse',
      description: 'Ночной сет: techno / house до утра. Свет, дым, танцпол. 18+.',
      photos: [photo('pasta-1'), photo('pasta-2')],
      tags: ['Вечеринка', 'Клуб', 'Алкоголь', '18+'],
      startAt: today(23, 0),
      endAt: tomorrow(5, 0),
      address: 'Минск, ул. Октябрьская, 16 (Ok16)',
      lat: 53.8901,
      lng: 27.5512,
      minGuests: 20,
      maxGuests: 200,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 35,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 18,
      requirementInterests: ['Techno', 'Клубы'],
      status: EventStatus.ACTIVE,
      boostedAt: new Date(),
      boostedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.user.update({
    where: { id: marina.id },
    data: {
      organizerProUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const ticketPass = await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.TAKEAWAY,
      title: 'Early bird · Techno Night',
      description: 'Предпродажа входа на Techno Night. Заберите QR у организатора.',
      photos: [photo('pasta-takeaway-1')],
      tags: ['Билеты', 'Клуб'],
      startAt: today(12, 0),
      endAt: today(22, 0),
      minGuests: 1,
      maxGuests: 100,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 25,
      requirementGender: GenderRequirement.ANY,
      pickupMethod: PickupMethod.MEET_AT_DOOR,
      pickupAddress: 'Минск, ул. Октябрьская, 16 - касса у входа',
      status: EventStatus.ACTIVE,
    },
  });

  const indieTonight = await prisma.event.create({
    data: {
      hostId: denis.id,
      format: EventFormat.IN_PERSON,
      title: 'Indie live · камерный концерт',
      description: 'Два местных проекта + afterparty-сет. 16+.',
      photos: [photo('bbq-1')],
      tags: ['Концерт', 'Live', 'Инди'],
      startAt: today(19, 30),
      endAt: today(22, 30),
      address: 'Минск, ул. Купалы, 25',
      lat: 53.9012,
      lng: 27.5588,
      minGuests: 15,
      maxGuests: 120,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 20,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 16,
      status: EventStatus.ACTIVE,
    },
  });

  // --- Завтра ---
  const standup = await prisma.event.create({
    data: {
      hostId: kate.id,
      format: EventFormat.IN_PERSON,
      title: 'Stand-up вечер в баре',
      description: 'Открытый микрофон и хедлайнеры минской сцены. Донат на входе.',
      photos: [photo('borscht-1')],
      tags: ['Stand-up', 'Бар', 'Юмор'],
      startAt: tomorrow(19, 0),
      endAt: tomorrow(22, 0),
      address: 'Минск, пр. Независимости, 25',
      lat: 53.9045,
      lng: 27.5615,
      minGuests: 10,
      maxGuests: 60,
      currentGuestsCount: 0,
      priceType: PriceType.DONATION,
      requirementGender: GenderRequirement.ANY,
      status: EventStatus.ACTIVE,
    },
  });

  const rooftop = await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.IN_PERSON,
      title: 'Rooftop sunset · house',
      description: 'Закат на крыше, house-сет и лёгкий бар.',
      photos: [photo('maria-1')],
      tags: ['Вечеринка', 'Open-air', 'DJ'],
      startAt: tomorrow(18, 0),
      endAt: tomorrow(23, 0),
      address: 'Минск, ул. Интернациональная, 25',
      lat: 53.8995,
      lng: 27.5540,
      minGuests: 20,
      maxGuests: 150,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 30,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 18,
      status: EventStatus.ACTIVE,
    },
  });

  // --- Ближайшие выходные ---
  const arenaShow = await prisma.event.create({
    data: {
      hostId: denis.id,
      format: EventFormat.IN_PERSON,
      title: 'Большой концерт на арене',
      description: 'Хедлайнер + support. Билеты на входе / у партнёров.',
      photos: [photo('bbq-1'), photo('bbq-2')],
      tags: ['Концерт', 'Арена', '18+'],
      startAt: friday(19, 0),
      endAt: friday(22, 30),
      address: 'Минск, пр. Победителей, 111 (Минск-Арена)',
      lat: 53.9364,
      lng: 27.4822,
      minGuests: 50,
      maxGuests: 5000,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 90,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 16,
      status: EventStatus.ACTIVE,
    },
  });

  const openAir = await prisma.event.create({
    data: {
      hostId: denis.id,
      format: EventFormat.IN_PERSON,
      title: 'Open-air у Комсомольского озера',
      description: 'Дневной open-air: indie / electronic, фудкорт рядом.',
      photos: [photo('wine-1')],
      tags: ['Open-air', 'Фестиваль', 'Лето'],
      startAt: saturday(15, 0),
      endAt: saturday(22, 0),
      address: 'Минск, парк Победы',
      lat: 53.9275,
      lng: 27.5350,
      minGuests: 30,
      maxGuests: 800,
      currentGuestsCount: 0,
      priceType: PriceType.FREE,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 16,
      status: EventStatus.ACTIVE,
    },
  });

  const clubSaturday = await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.IN_PERSON,
      title: 'Saturday Club · Melodic techno',
      description: 'Гостевой DJ + резиденты. Гардероб и бар до утра.',
      photos: [photo('pasta-2')],
      tags: ['Клуб', 'DJ', '18+'],
      startAt: saturday(23, 0),
      endAt: dayAt(
        Math.round((saturday(23, 0).getTime() - dayAt(0, 0).getTime()) / 86400000) + 1,
        5,
        0,
      ),
      address: 'Минск, ул. Октябрьская, 19',
      lat: 53.8910,
      lng: 27.5520,
      minGuests: 30,
      maxGuests: 300,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 40,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 18,
      status: EventStatus.ACTIVE,
    },
  });

  const testParty = await prisma.event.create({
    data: {
      hostId: testPerformer.id,
      format: EventFormat.IN_PERSON,
      title: 'Тестовая вечеринка (прошедшая)',
      description: 'Демо-событие для проверки отзывов - уже завершилось.',
      photos: [photo('test-dinner-1')],
      tags: ['Вечеринка', 'Тест'],
      startAt: yesterday(22, 0),
      endAt: yesterday(23, 30),
      address: 'Минск, ул. Тестовая, 1',
      lat: 53.9000,
      lng: 27.5600,
      citySlug: 'minsk',
      minGuests: 1,
      maxGuests: 40,
      currentGuestsCount: 1,
      priceType: PriceType.FREE,
      requirementGender: GenderRequirement.ANY,
      status: EventStatus.ACTIVE,
    },
  });

  // Russia demos — visible when city filter switches away from Minsk
  await prisma.event.create({
    data: {
      hostId: denis.id,
      format: EventFormat.IN_PERSON,
      title: 'Techno · Flacon',
      description: 'Ночной сет в Москве. Гостевой лист в Пульсе.',
      photos: [photo('pasta-1')],
      tags: ['Вечеринка', 'Клуб', '18+'],
      startAt: today(23, 0),
      endAt: tomorrow(5, 0),
      address: 'Москва, ул. Большая Новодмитровская, 36',
      lat: 55.8051,
      lng: 37.5856,
      citySlug: 'moscow',
      minGuests: 20,
      maxGuests: 250,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 1500,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 18,
      status: EventStatus.ACTIVE,
    },
  });

  await prisma.event.create({
    data: {
      hostId: denis.id,
      format: EventFormat.IN_PERSON,
      title: 'Джаз на Васильевском',
      description: 'Камерный вечер в Санкт-Петербурге.',
      photos: [photo('wine-1')],
      tags: ['Джаз', 'Live', 'Бар'],
      startAt: today(20, 0),
      endAt: today(23, 0),
      address: 'Санкт-Петербург, 6-я линия В.О., 23',
      lat: 59.9422,
      lng: 30.2789,
      citySlug: 'saint-petersburg',
      minGuests: 10,
      maxGuests: 60,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 1200,
      requirementGender: GenderRequirement.ANY,
      status: EventStatus.ACTIVE,
    },
  });

  await prisma.event.create({
    data: {
      hostId: marina.id,
      format: EventFormat.IN_PERSON,
      title: 'Roof party · Москва-Сити',
      description: 'Закат и house на крыше. Дресс-код smart casual.',
      photos: [photo('pasta-2')],
      tags: ['Вечеринка', 'Open-air'],
      startAt: today(19, 0),
      endAt: today(23, 30),
      address: 'Москва, Пресненская наб., 12',
      lat: 55.7494,
      lng: 37.5375,
      citySlug: 'moscow',
      minGuests: 15,
      maxGuests: 120,
      currentGuestsCount: 0,
      priceType: PriceType.FIXED,
      priceAmount: 2000,
      requirementGender: GenderRequirement.ANY,
      requirementMinAge: 18,
      status: EventStatus.ACTIVE,
      boostedAt: new Date(),
      boostedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.application.create({
    data: {
      eventId: testParty.id,
      userId: testUser.id,
      status: ApplicationStatus.ACCEPTED,
      message: 'Заявка тестового аккаунта.',
    },
  });
  const testChat = await prisma.chat.create({ data: { eventId: testParty.id } });
  await prisma.chatParticipant.createMany({
    data: [
      { chatId: testChat.id, userId: testPerformer.id },
      { chatId: testChat.id, userId: testUser.id },
    ],
  });

  // ---------------------------------------------------------------------
  // Applications + chats
  // ---------------------------------------------------------------------
  await prisma.application.create({
    data: {
      eventId: technoNight.id,
      userId: alex.id,
      status: ApplicationStatus.ACCEPTED,
      message: 'Буду! Можно с подругой?',
    },
  });
  await prisma.event.update({ where: { id: technoNight.id }, data: { currentGuestsCount: { increment: 1 } } });

  await prisma.application.create({
    data: {
      eventId: technoNight.id,
      userId: olga.id,
      status: ApplicationStatus.PENDING,
      message: 'Хочу на танцпол, напишите дресс-код.',
    },
  });

  await prisma.application.create({
    data: {
      eventId: jazz.id,
      userId: olga.id,
      status: ApplicationStatus.ACCEPTED,
      message: 'Обожаю джаз, буду!',
    },
  });
  await prisma.event.update({ where: { id: jazz.id }, data: { currentGuestsCount: { increment: 1 } } });

  await prisma.application.create({
    data: {
      eventId: arenaShow.id,
      userId: alex.id,
      status: ApplicationStatus.REJECTED,
      message: 'Есть места у сцены?',
    },
  });

  const technoChat = await prisma.chat.create({ data: { eventId: technoNight.id } });
  await prisma.chatParticipant.createMany({
    data: [
      { chatId: technoChat.id, userId: marina.id },
      { chatId: technoChat.id, userId: alex.id },
    ],
  });
  const m1 = await prisma.message.create({
    data: { chatId: technoChat.id, senderId: marina.id, text: 'Привет! Старт в 23:00, вход по списку 😉' },
  });
  const m2 = await prisma.message.create({
    data: { chatId: technoChat.id, senderId: alex.id, text: 'Супер, а бар на площадке есть?' },
  });
  await prisma.message.create({
    data: { chatId: technoChat.id, senderId: marina.id, text: 'Да, бар и гардероб работают всю ночь.' },
  });
  await prisma.messageRead.createMany({
    data: [
      { messageId: m1.id, userId: alex.id },
      { messageId: m2.id, userId: marina.id },
    ],
    skipDuplicates: true,
  });

  const jazzChat = await prisma.chat.create({ data: { eventId: jazz.id } });
  await prisma.chatParticipant.createMany({
    data: [
      { chatId: jazzChat.id, userId: marina.id },
      { chatId: jazzChat.id, userId: olga.id },
    ],
  });
  await prisma.message.create({
    data: { chatId: jazzChat.id, senderId: olga.id, text: 'Во сколько лучше подойти?' },
  });

  // ---------------------------------------------------------------------
  // Requests
  // ---------------------------------------------------------------------
  const companyRequest = await prisma.guestRequest.create({
    data: {
      authorId: alex.id,
      type: GuestRequestType.GENERAL,
      title: 'Ищу компанию на концерт',
      description: 'Хочу сходить на арену в пятницу, ищу 1–2 человек.',
      budgetType: PriceType.FIXED,
      budgetAmount: 90,
      requestedAt: friday(19, 0),
      address: 'Минск, Минск-Арена',
      status: GuestRequestStatus.OFFERED,
    },
  });
  await prisma.requestOffer.create({
    data: {
      requestId: companyRequest.id,
      hostId: denis.id,
      status: RequestOfferStatus.PENDING,
      message: 'Могу взять вас в группу на балкон, напишите в чат.',
    },
  });

  await prisma.guestRequest.create({
    data: {
      authorId: igor.id,
      type: GuestRequestType.GENERAL,
      title: 'Нужен фотограф на вечеринку',
      description: 'Ищем человека на techno-night: репортаж + 30 фото в ленту.',
      portionsCount: 1,
      budgetType: PriceType.FIXED,
      budgetAmount: 200,
      requestedAt: today(22, 0),
      address: 'Минск, Ok16',
      status: GuestRequestStatus.OPEN,
    },
  });

  await prisma.guestRequest.create({
    data: {
      authorId: olga.id,
      type: GuestRequestType.PERSONAL,
      title: 'Повторите джазовый вечер?',
      description: 'Были на прошлом — хотите ещё один камерный сет?',
      budgetType: PriceType.DONATION,
      requestedAt: friday(20, 0),
      address: 'Минск, Верхний город',
      targetHostId: marina.id,
      status: GuestRequestStatus.OPEN,
    },
  });

  // ---------------------------------------------------------------------
  // Social posts + stories
  // ---------------------------------------------------------------------
  const post1 = await prisma.post.create({
    data: {
      authorId: marina.id,
      imageUrl: photo('pasta-1'),
      caption: 'Техно-ночь в Ok16. Кто идёт?',
    },
  });
  await prisma.post.create({
    data: {
      authorId: denis.id,
      imageUrl: photo('bbq-1'),
      caption: 'Live на Купалы - камерный вайб.',
    },
  });
  await prisma.post.create({
    data: {
      authorId: kate.id,
      imageUrl: photo('borscht-1'),
      caption: 'Stand-up завтра. Берите друзей.',
    },
  });
  await prisma.postLike.create({
    data: { postId: post1.id, userId: alex.id },
  });
  await prisma.postLike.create({
    data: { postId: post1.id, userId: olga.id },
  });

  const storyExpires = new Date(Date.now() + 20 * 60 * 60 * 1000);
  await prisma.story.create({
    data: {
      authorId: marina.id,
      imageUrl: photo('pasta-2'),
      expiresAt: storyExpires,
    },
  });
  await prisma.story.create({
    data: {
      authorId: marina.id,
      imageUrl: photo('wine-1'),
      expiresAt: storyExpires,
    },
  });
  await prisma.story.create({
    data: {
      authorId: denis.id,
      imageUrl: photo('bbq-2'),
      expiresAt: storyExpires,
    },
  });
  await prisma.story.create({
    data: {
      authorId: kate.id,
      imageUrl: photo('game-1'),
      expiresAt: storyExpires,
    },
  });

  // ---------------------------------------------------------------------
  // Reviews
  // ---------------------------------------------------------------------
  await prisma.review.create({
    data: {
      eventId: technoNight.id,
      reviewerId: alex.id,
      targetId: marina.id,
      targetRole: ReviewTargetRole.HOST,
      scores: {
        taste: 95,
        atmosphere: 100,
        hospitality: 96,
        cleanliness: 90,
        sociability: 98,
        matchesDescription: 97,
        organization: 94,
        vibe: 100,
      },
      overallScore: 97,
      comment: 'Огонь! Звук и свет на уровне, обязательно ещё приду.',
    },
  });

  await prisma.review.create({
    data: {
      eventId: technoNight.id,
      reviewerId: marina.id,
      targetId: alex.id,
      targetRole: ReviewTargetRole.GUEST,
      scores: {
        punctuality: 90,
        politeness: 95,
        communicability: 92,
        ruleFollowing: 100,
        tidiness: 88,
        overallImpression: 93,
      },
      overallScore: 93,
      comment: 'Адекватный гость, без проблем на входе.',
    },
  });

  // ---------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------
  await prisma.notification.create({
    data: {
      userId: marina.id,
      type: NotificationType.APPLICATION_RECEIVED,
      title: 'Новая заявка',
      body: `Новая заявка на «${technoNight.title}»`,
      payload: { eventId: technoNight.id },
      isRead: false,
    },
  });
  await prisma.notification.create({
    data: {
      userId: alex.id,
      type: NotificationType.APPLICATION_ACCEPTED,
      title: 'Заявка принята',
      body: `Ваша заявка на «${technoNight.title}» принята`,
      payload: { eventId: technoNight.id, chatId: technoChat.id },
      isRead: true,
    },
  });
  await prisma.notification.create({
    data: {
      userId: marina.id,
      type: NotificationType.RATE_REMINDER,
      title: 'Не забудьте оценить гостя',
      body: `Как прошла «${technoNight.title}»? Оцените гостя.`,
      payload: { eventId: technoNight.id },
      isRead: false,
    },
  });

  await prisma.complaint.create({
    data: {
      reporterId: igor.id,
      targetType: ComplaintTargetType.EVENT,
      targetId: arenaShow.id,
      reason: 'Организатор не отвечает после продажи билета.',
      status: ComplaintStatus.OPEN,
    },
  });

  console.log('Seed complete (Пульс / Минск):');
  console.log(`  Users: marina=${marina.id} denis=${denis.id} kate=${kate.id} alex=${alex.id}`);
  console.log(`  Events today+: ${[quizToday, indieTonight, jazz, technoNight, ticketPass, standup, rooftop, arenaShow, openAir, clubSaturday].map((e) => e.title).join(' | ')}`);
  console.log('  Dev login: POST /api/v1/auth/verify-code with code "0000"');
  console.log(`    USER:      ${testUser.phone}`);
  console.log(`    PERFORMER: ${testPerformer.phone}`);
  console.log(`    ADMIN:     ${admin.phone}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
