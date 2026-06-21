import Router from '@koa/router';
import type { Context } from 'koa';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';

const router = new Router({ prefix: '/buyers' });
const uploadRoot = path.resolve(process.cwd(), 'uploads', 'buyers');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const maxBytes = 5 * 1024 * 1024;

interface PhotoBody {
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

router.get('/:buyerId/photos', async (ctx: Context) => {
  const buyerId = BigInt(ctx.params.buyerId);
  const rows = await prisma.buyerPhoto.findMany({
    where: { buyerId },
    orderBy: { id: 'desc' },
  });
  ctx.body = { data: serialize(rows) };
});

router.post('/:buyerId/photos', async (ctx: Context) => {
  const buyerId = BigInt(ctx.params.buyerId);
  const body = ctx.request.body as PhotoBody;
  if (!body.mimeType || !allowedMimeTypes.has(body.mimeType)) {
    throw new AppError(400, 'VALIDATION_ERROR', '仅支持 jpg、png、webp、gif 图片');
  }
  if (!body.dataBase64) throw new AppError(400, 'VALIDATION_ERROR', '图片内容必填');
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId }, select: { id: true } });
  if (!buyer) throw new AppError(404, 'NOT_FOUND', '消费者不存在');

  const cleanBase64 = body.dataBase64.includes(',')
    ? body.dataBase64.slice(body.dataBase64.indexOf(',') + 1)
    : body.dataBase64;
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length || buffer.length > maxBytes) {
    throw new AppError(400, 'VALIDATION_ERROR', '图片大小需在 5MB 以内');
  }

  await mkdir(path.join(uploadRoot, String(buyerId)), { recursive: true });
  const created = await prisma.buyerPhoto.create({
    data: {
      buyerId,
      fileName: body.fileName || `photo${extensionFor(body.mimeType)}`,
      url: '',
      mimeType: body.mimeType,
      size: buffer.length,
    },
  });
  const storedName = `${created.id}${extensionFor(body.mimeType)}`;
  const filePath = path.join(uploadRoot, String(buyerId), storedName);
  await writeFile(filePath, buffer);
  const row = await prisma.buyerPhoto.update({
    where: { id: created.id },
    data: { url: `/api/buyers/${buyerId}/photos/${created.id}/content` },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.get('/:buyerId/photos/:photoId/content', async (ctx: Context) => {
  const photo = await prisma.buyerPhoto.findFirst({
    where: { id: BigInt(ctx.params.photoId), buyerId: BigInt(ctx.params.buyerId) },
  });
  if (!photo) throw new AppError(404, 'NOT_FOUND', '照片不存在');
  const filePath = path.join(uploadRoot, String(photo.buyerId), `${photo.id}${extensionFor(photo.mimeType)}`);
  ctx.type = photo.mimeType;
  ctx.body = await readFile(filePath);
});

router.delete('/:buyerId/photos/:photoId', async (ctx: Context) => {
  const photo = await prisma.buyerPhoto.findFirst({
    where: { id: BigInt(ctx.params.photoId), buyerId: BigInt(ctx.params.buyerId) },
  });
  if (!photo) throw new AppError(404, 'NOT_FOUND', '照片不存在');
  await prisma.buyerPhoto.delete({ where: { id: photo.id } });
  const filePath = path.join(uploadRoot, String(photo.buyerId), `${photo.id}${extensionFor(photo.mimeType)}`);
  await unlink(filePath).catch(() => {});
  ctx.status = 204;
});

export default router;
