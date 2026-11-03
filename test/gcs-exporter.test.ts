import test from 'node:test';
import assert from 'node:assert/strict';
import GCSExporter, { BucketLike } from '../src/services/gcs-exporter';
import { ImageBatchItem } from '../src/utils/types';

interface SaveCall {
  fileName: string;
  data: Buffer;
  options: { contentType?: string; resumable?: boolean };
}

type SaveHandler = (call: SaveCall) => Promise<unknown>;

// A bucket that records every save and delegates the result to the handler.
const makeBucket = (onSave: SaveHandler): { bucket: BucketLike; calls: SaveCall[] } => {
  const calls: SaveCall[] = [];
  const bucket: BucketLike = {
    file: (fileName: string) => ({
      save: (data: Buffer, options: SaveCall['options']) => {
        const call = { fileName, data, options };
        calls.push(call);
        return onSave(call);
      },
    }),
  };

  return { bucket, calls };
};

const makeItem = (index: number): ImageBatchItem => ({
  fileName: `media/snapshots/cam-1/frames-hq/${index}.jpeg`,
  buffer: Buffer.from([index]),
});

test('uploads every item as a non-resumable jpeg', async () => {
  const { bucket, calls } = makeBucket(async () => ({}));
  const exporter = new GCSExporter('project', 'bucket', { bucket });

  const result = await exporter.batchUploadImages([makeItem(0), makeItem(1)]);

  assert.deepEqual(result, { uploaded: 2, failed: 0 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.contentType, 'image/jpeg');
    assert.equal(call.options.resumable, false);
  }
});

test('runs no more saves than the concurrency limit', async () => {
  let active = 0;
  let maxActive = 0;
  const { bucket } = makeBucket(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>(resolve => setTimeout(resolve, 10));
    active -= 1;
    return {};
  });
  const exporter = new GCSExporter('project', 'bucket', { bucket, concurrency: 2 });

  const result = await exporter.batchUploadImages([0, 1, 2, 3, 4].map(makeItem));

  assert.deepEqual(result, { uploaded: 5, failed: 0 });
  assert.equal(maxActive, 2);
});

test('resolves only after a slow save has finished', async () => {
  let finished = false;
  const { bucket } = makeBucket(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    finished = true;
    return {};
  });
  const exporter = new GCSExporter('project', 'bucket', { bucket });

  await exporter.batchUploadImages([makeItem(0)]);

  assert.equal(finished, true);
});

test('counts a failed save without rejecting', async () => {
  let call = 0;
  const { bucket } = makeBucket(async () => {
    call += 1;
    if (call === 2) {
      throw new Error('upload failed');
    }
    return {};
  });
  const exporter = new GCSExporter('project', 'bucket', { bucket, concurrency: 4 });

  const result = await exporter.batchUploadImages([0, 1, 2, 3].map(makeItem));

  assert.deepEqual(result, { uploaded: 3, failed: 1 });
});

test('skips items without a buffer', async () => {
  const { bucket, calls } = makeBucket(async () => ({}));
  const exporter = new GCSExporter('project', 'bucket', { bucket });

  const result = await exporter.batchUploadImages([
    makeItem(0),
    { fileName: 'empty.jpeg', buffer: undefined as unknown as Buffer },
  ]);

  assert.deepEqual(result, { uploaded: 1, failed: 0 });
  assert.equal(calls.length, 1);
});
