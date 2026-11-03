import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import ImageConverter from '../src/services/image-converter';

test('converts a high quality frame to a low quality one', async () => {
  const src = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#808080' },
  })
    .jpeg()
    .toBuffer();

  const out = await new ImageConverter().convert({
    fileName: 'media/snapshots/c/frames-hq/t.jpeg',
    buffer: src,
  });

  assert.equal(out.fileName, 'media/snapshots/c/frames-lq/t.jpeg');

  const metadata = await sharp(out.buffer).metadata();
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 180);
  assert.equal(metadata.format, 'jpeg');
});
