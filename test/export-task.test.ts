import test from 'node:test';
import assert from 'node:assert/strict';
import { createExportTask } from '../src/services/export-task';
import { FrameTracker } from '../src/services/frame-tracker';
import { ImageBatchItem, InferenceEvent } from '../src/utils/types';

const image = Buffer.from('image').toString('base64');

const frame = (id: string, timestamp: string): InferenceEvent => ({
  metadata: { id, timestamp, namespace: 'test' },
  data: { image, peripheral: { id } },
  device: 'device',
});

const makeDeps = () => {
  const frames = new Map<string, InferenceEvent>([
    ['field-1', frame('cam-1', '2026-11-03T10:00:00.000Z')],
    ['field-2', frame('cam-2', '2026-11-03T10:00:00.000Z')],
    ['field-3', frame('cam-3', '2026-11-03T10:00:00.000Z')],
    ['field-4', frame('cam-4', '2026-11-03T10:00:00.000Z')],
  ]);
  const uploads: ImageBatchItem[][] = [];
  const adds: ImageBatchItem[] = [];
  const tracker = new FrameTracker();

  const task = createExportTask({
    cache: {
      forEachEntry: async <T>(
        _set: string,
        cb: (field: string, value: T) => void
      ): Promise<boolean> => {
        for (const [field, value] of frames) {
          cb(field, value as unknown as T);
        }
        return true;
      },
    },
    exporter: {
      batchUploadImages: async (items: ImageBatchItem[]) => {
        uploads.push(items);
        return { uploaded: items.length, failed: 0 };
      },
    },
    queue: {
      add: (item: ImageBatchItem): boolean => {
        adds.push(item);
        return true;
      },
    },
    tracker,
  });

  return { frames, uploads, adds, tracker, task };
};

test('exports each cached frame once', async () => {
  const { uploads, adds, tracker, task } = makeDeps();

  await task();
  await task();
  await task();

  assert.equal(uploads.flat().length, 4);
  assert.equal(adds.length, 4);
  assert.equal(tracker.size(), 4);

  // Nothing was new on the last two runs, so nothing was uploaded again.
  assert.equal(uploads.length, 1);

  const cam1 = uploads.flat().find(item => item.fileName.includes('/cam-1/'));
  assert.equal(
    cam1?.fileName,
    'media/snapshots/cam-1/frames-hq/2026-11-03T10-00-00.000Z.jpeg'
  );
});

test('exports a camera again when its timestamp changes', async () => {
  const { frames, uploads, adds, task } = makeDeps();

  await task();
  frames.set('field-1', frame('cam-1', '2026-11-03T10:00:30.000Z'));
  await task();

  assert.equal(uploads.flat().length, 5);
  assert.equal(adds.length, 5);
});

test('prunes fields that are no longer in the cache', async () => {
  const { frames, tracker, task } = makeDeps();

  await task();
  assert.equal(tracker.size(), 4);

  frames.delete('field-4');
  await task();

  assert.equal(tracker.size(), 3);
});

test('skips a frame without image data', async () => {
  const { frames, uploads, adds, task } = makeDeps();
  const withoutImage = frame('cam-5', '2026-11-03T10:00:00.000Z');
  withoutImage.data = {};
  frames.set('field-5', withoutImage);

  await task();

  assert.equal(uploads.flat().length, 4);
  assert.equal(adds.length, 4);
});

test('keeps the tracker when the cache is not ready', async () => {
  const frames = new Map<string, InferenceEvent>([
    ['field-1', frame('cam-1', '2026-11-03T10:00:00.000Z')],
    ['field-2', frame('cam-2', '2026-11-03T10:00:00.000Z')],
    ['field-3', frame('cam-3', '2026-11-03T10:00:00.000Z')],
    ['field-4', frame('cam-4', '2026-11-03T10:00:00.000Z')],
  ]);
  const uploads: ImageBatchItem[][] = [];
  const tracker = new FrameTracker();
  let ready = true;

  const task = createExportTask({
    cache: {
      forEachEntry: async <T>(
        _set: string,
        cb: (field: string, value: T) => void
      ): Promise<boolean> => {
        if (!ready) {
          return false;
        }
        for (const [field, value] of frames) {
          cb(field, value as unknown as T);
        }
        return true;
      },
    },
    exporter: {
      batchUploadImages: async (items: ImageBatchItem[]) => {
        uploads.push(items);
        return { uploaded: items.length, failed: 0 };
      },
    },
    queue: { add: () => true },
    tracker,
  });

  await task();
  assert.equal(tracker.size(), 4);
  assert.equal(uploads.length, 1);

  // Redis not ready: nothing is scanned, so nothing may be pruned.
  ready = false;
  await task();
  assert.equal(tracker.size(), 4);
  assert.equal(uploads.length, 1);

  // The same frames are still known, so nothing is uploaded again.
  ready = true;
  await task();
  assert.equal(uploads.length, 1);
  assert.equal(tracker.size(), 4);
});

test('uploads collected frames and keeps the tracker when the scan fails', async () => {
  const frames = new Map<string, InferenceEvent>([
    ['field-1', frame('cam-1', '2026-11-03T10:00:00.000Z')],
    ['field-2', frame('cam-2', '2026-11-03T10:00:00.000Z')],
    ['field-3', frame('cam-3', '2026-11-03T10:00:00.000Z')],
    ['field-4', frame('cam-4', '2026-11-03T10:00:00.000Z')],
  ]);
  const newFrames = new Map<string, InferenceEvent>([
    ['field-5', frame('cam-5', '2026-11-03T10:00:30.000Z')],
    ['field-6', frame('cam-6', '2026-11-03T10:00:30.000Z')],
  ]);
  const uploads: ImageBatchItem[][] = [];
  const tracker = new FrameTracker();
  let fail = false;

  const task = createExportTask({
    cache: {
      forEachEntry: async <T>(
        _set: string,
        cb: (field: string, value: T) => void
      ): Promise<boolean> => {
        const source = fail ? newFrames : frames;
        for (const [field, value] of source) {
          cb(field, value as unknown as T);
        }
        if (fail) {
          throw new Error('scan failed');
        }
        return true;
      },
    },
    exporter: {
      batchUploadImages: async (items: ImageBatchItem[]) => {
        uploads.push(items);
        return { uploaded: items.length, failed: 0 };
      },
    },
    queue: { add: () => true },
    tracker,
  });

  await task();
  assert.equal(tracker.size(), 4);
  assert.equal(uploads.length, 1);

  fail = true;
  await assert.rejects(task(), /scan failed/);

  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].length, 2);
  assert.equal(tracker.size(), 6);
});
