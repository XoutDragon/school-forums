import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ApiError } from '../lib/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(here, '..', '..', 'uploads');

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never trust the client's filename on disk — keep the extension, discard the rest.
    const ext = extname(file.originalname)
      .slice(0, 10)
      .replace(/[^A-Za-z0-9.]/g, '');
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10 MB (§2)
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(ApiError.badRequest(`Can't accept ${file.mimetype} files`));
      return;
    }
    cb(null, true);
  },
});

export const publicUrlFor = (filename: string) => `/uploads/${filename}`;
