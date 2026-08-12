import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { imageUploadOptions, videoUploadOptions } from '../common/upload.config';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(private social: SocialService) {}

  @Public()
  @Get('posts')
  @ApiOperation({ summary: 'Feed of posts (optional authorId filter)' })
  listPosts(
    @CurrentUser() user: AuthUser | undefined,
    @Query('authorId') authorId?: string,
  ) {
    return this.social.listPosts(user?.id, authorId);
  }

  @Post('posts')
  @ApiOperation({ summary: 'Create a post (JSON with imageUrl from upload)' })
  createPost(
    @CurrentUser() user: AuthUser,
    @Body() body: { imageUrl: string; caption?: string; placeId?: string },
  ) {
    return this.social.createPost(user.id, body);
  }

  @Post('posts/upload')
  @ApiOperation({ summary: 'Upload an image for a post or story' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}` };
  }

  @Post('stories/upload-video')
  @ApiOperation({ summary: 'Upload a short video for a story / boomerang' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', videoUploadOptions))
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}` };
  }

  @Get('posts/saved')
  @ApiOperation({ summary: 'List saved posts for current user' })
  listSaved(@CurrentUser() user: AuthUser) {
    return this.social.listSavedPosts(user.id);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete own post' })
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.deletePost(user.id, id);
  }

  @Post('posts/:id/like')
  @ApiOperation({ summary: 'Like a post' })
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.likePost(user.id, id);
  }

  @Delete('posts/:id/like')
  @ApiOperation({ summary: 'Unlike a post' })
  unlike(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.unlikePost(user.id, id);
  }

  @Public()
  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'List comments on a post' })
  listComments(@Param('id') id: string) {
    return this.social.listComments(id);
  }

  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Add a comment to a post' })
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    return this.social.addComment(user.id, id, body.text ?? '');
  }

  @Post('posts/:id/save')
  @ApiOperation({ summary: 'Save / bookmark a post' })
  savePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.savePost(user.id, id);
  }

  @Delete('posts/:id/save')
  @ApiOperation({ summary: 'Remove post from saved' })
  unsavePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.unsavePost(user.id, id);
  }

  @Public()
  @Get('stories/feed')
  @ApiOperation({ summary: 'Active stories grouped by author (< 24h)' })
  storiesFeed(@CurrentUser() user: AuthUser | undefined) {
    return this.social.storiesFeed(user?.id);
  }

  @Post('stories')
  @ApiOperation({ summary: 'Publish a story (expires in 24h)' })
  createStory(
    @CurrentUser() user: AuthUser,
    @Body() body: { imageUrl: string; placeId?: string; videoUrl?: string },
  ) {
    return this.social.createStory(user.id, body.imageUrl, body.placeId, body.videoUrl);
  }

  @Post('stories/:id/view')
  @ApiOperation({ summary: 'Mark story as viewed' })
  viewStory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.viewStory(user.id, id);
  }
}
