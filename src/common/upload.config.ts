import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.m4a',
  '.aac',
  '.mp3',
  '.caf',
  '.wav',
  '.webm',
  '.ogg',
]);
const ALLOWED_CHAT_ATTACHMENT_EXTENSIONS = new Set([
  ...ALLOWED_IMAGE_EXTENSIONS,
  '.heic',
  '.heif',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.zip',
  '.rar',
]);

export const imageUploadOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      cb(
        new BadRequestException(
          'Only jpg, jpeg, png, webp, gif images are allowed',
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

/** Short story / boomerang clips. */
const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

export const videoUploadOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      cb(
        new BadRequestException('Only mp4, mov, m4v, webm videos are allowed'),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

/** Voice notes in chat — keep under ~2 min / 10 MB. */
export const audioUploadOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.m4a';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext) || mime.startsWith('audio/')) {
      cb(null, true);
      return;
    }
    cb(
      new BadRequestException(
        'Only m4a, aac, mp3, caf, wav, webm, ogg audio is allowed',
      ),
      false,
    );
  },
};

/** Photos + common documents in chat (up to 15 MB). */
export const chatAttachmentUploadOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '';
      cb(null, `${randomUUID()}${ext || '.bin'}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (
      ALLOWED_CHAT_ATTACHMENT_EXTENSIONS.has(ext) ||
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime.startsWith('application/msword') ||
      mime.includes('officedocument') ||
      mime === 'text/plain' ||
      mime === 'application/zip'
    ) {
      cb(null, true);
      return;
    }
    cb(
      new BadRequestException(
        'Allowed: photos (jpg/png/webp/heic) or files (pdf/doc/xls/txt/zip)',
      ),
      false,
    );
  },
};
