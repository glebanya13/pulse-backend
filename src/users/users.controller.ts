import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { imageUploadOptions } from '../common/upload.config';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeletePhotoDto } from './dto/delete-photo.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'My full profile (private fields included)' })
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.me(user.id);
  }

  @Public()
  @Get('author-of-month')
  @ApiOperation({ summary: 'Current curated author of the month (showcase)' })
  authorOfMonth() {
    return this.usersService.authorOfMonthShowcase();
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }

  @Post('me/become-organizer')
  @ApiOperation({
    summary:
      'Become an organizer (PERFORMER) to publish events in the Pulse afisha',
  })
  becomeOrganizer(@CurrentUser() user: AuthUser) {
    return this.usersService.becomeOrganizer(user.id);
  }

  @Put('me/fcm-token')
  @ApiOperation({
    summary: 'Register or clear this device FCM token for push notifications',
  })
  setFcmToken(@CurrentUser() user: AuthUser, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.setFcmToken(user.id, dto.token ?? null);
  }

  @Post('me/photos')
  @ApiOperation({
    summary:
      'Upload profile/gallery photos (multipart/form-data, field name "files"). Served back under /uploads/*.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, imageUploadOptions))
  async addPhotos(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const urls = (files ?? []).map((f) => `/uploads/${f.filename}`);
    return this.usersService.addPhotoUrls(user.id, urls);
  }

  @Delete('me/photos')
  @ApiOperation({
    summary:
      'Remove a photo (clears avatarUrl too if it was the avatar; deletes the file if local)',
  })
  removePhoto(@CurrentUser() user: AuthUser, @Body() dto: DeletePhotoDto) {
    return this.usersService.removePhotoUrl(user.id, dto.url);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete my account and associated personal data (App Store 5.1.1(v))',
  })
  async deleteAccount(@CurrentUser() user: AuthUser) {
    await this.usersService.deleteAccount(user.id);
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'List followers of a user' })
  listFollowers(@Param('id') id: string) {
    return this.usersService.listFollowers(id);
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'List users this person follows' })
  listFollowing(@Param('id') id: string) {
    return this.usersService.listFollowing(id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary:
      'Public profile of a user (host profile screen / general profile screen)',
  })
  publicProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.usersService.publicProfile(id, user?.id);
  }

  @Post(':id/follow')
  @ApiOperation({ summary: 'Follow a user (Подписаться)' })
  follow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.follow(user.id, id);
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unfollow(user.id, id);
  }

  @Post(':id/block')
  @ApiOperation({
    summary:
      'Block a user (Заблокировать) — hides their events/requests from me and mine from them',
  })
  block(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.block(user.id, id);
  }

  @Delete(':id/block')
  @ApiOperation({ summary: 'Unblock a user' })
  unblock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unblock(user.id, id);
  }
}
