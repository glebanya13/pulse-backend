import {
  Body,
  Controller,
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
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { audioUploadOptions, chatAttachmentUploadOptions } from '../common/upload.config';
import { ChatsService } from './chats.service';
import { CreateDmDto } from './dto/create-dm.dto';
import { SendAttachmentDto } from './dto/send-attachment.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendVoiceDto } from './dto/send-voice.dto';

@ApiTags('chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(private chatsService: ChatsService) {}

  @Get()
  @ApiOperation({
    summary: 'List my chats (event group chats + direct messages)',
  })
  findMine(@CurrentUser() user: AuthUser) {
    return this.chatsService.findMine(user.id);
  }

  @Post('dm')
  @ApiOperation({
    summary: 'Open or create a direct (1:1) chat with another user',
  })
  createDm(@CurrentUser() user: AuthUser, @Body() dto: CreateDmDto) {
    return this.chatsService.getOrCreateDm(user.id, dto.userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Total unread messages across all my chats' })
  unreadTotal(@CurrentUser() user: AuthUser) {
    return this.chatsService.unreadTotal(user.id);
  }

  @Get('by-event/:eventId')
  @ApiOperation({
    summary:
      'Get the event chat for the current user (must already be a participant)',
  })
  findByEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatsService.findByEvent(eventId, user.id);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary:
      'Paginated messages for a chat, newest first (history + WS reconnect sync)',
  })
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.chatsService.getMessages(id, user.id, pagination);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a text message in a chat' })
  postMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatsService.postMessage(id, user.id, dto);
  }

  @Post(':id/messages/voice')
  @ApiOperation({ summary: 'Send a voice message (multipart audio file)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        durationMs: { type: 'integer', example: 4500 },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', audioUploadOptions))
  postVoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SendVoiceDto,
  ) {
    return this.chatsService.postVoiceMessage(
      id,
      user.id,
      file,
      dto.durationMs,
    );
  }

  @Post(':id/messages/attachment')
  @ApiOperation({
    summary: 'Send a photo or file attachment in a chat (multipart)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        text: { type: 'string', example: 'Вот варианты вина' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', chatAttachmentUploadOptions))
  postAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SendAttachmentDto,
  ) {
    return this.chatsService.postAttachmentMessage(
      id,
      user.id,
      file,
      dto.text,
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark all messages in this chat as read by me' })
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chatsService.markRead(id, user.id);
  }
}
