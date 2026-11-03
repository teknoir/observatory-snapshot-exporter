/// <reference lib="es2021.weakref" />
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import ConverterQueue, { ImageConverterLike } from '../src/services/converter-queue';
import { ImageBatchItem } from '../src/utils/types';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const makeItem = (index: number, size: number = 10): ImageBatchItem => ({
  fileName: `frames-hq/${index}.jpeg`,
  buffer: Buffer.alloc(size),
});

// Resolves on the next tick with a small buffer.
const fakeConverter = (): ImageConverterLike => ({
  convert: async (item: ImageBatchItem): Promise<ImageBatchItem> => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    return {
      fileName: item.fileName.replace('frames-hq', 'frames-lq'),
      buffer: Buffer.alloc(10),
    };
  },
});

test('delivers every item and retains nothing', async t => {
  const batches: ImageBatchItem[][] = [];
  const queue = new ConverterQueue(
    10,
    10,
    async batch => {
      batches.push(batch);
    },
    // 100 adds happen before any conversion settles, so allow 100 in flight.
    { converter: fakeConverter(), maxInFlight: 200 }
  );
  t.after(() => queue.drain());

  for (let i = 0; i < 100; i += 1) {
    assert.equal(queue.add(makeItem(i)), true);
  }

  await queue.drain();

  const total = batches.reduce((sum, batch) => sum + batch.length, 0);
  assert.equal(total, 100);
  assert.deepEqual(queue.stats(), {
    inFlight: 0,
    resolved: 0,
    dropped: 0,
    timerRunning: false,
  });
});

test('drops a batch whose callback rejects without retrying it', async t => {
  let calls = 0;
  const queue = new ConverterQueue(
    5,
    10,
    async () => {
      calls += 1;
      throw new Error('upload failed');
    },
    { converter: fakeConverter(), maxInFlight: 50 }
  );
  t.after(() => queue.drain());

  for (let i = 0; i < 10; i += 1) {
    queue.add(makeItem(i));
  }

  await queue.drain();

  assert.equal(calls, 2);
  assert.equal(queue.stats().resolved, 0);
  assert.equal(queue.stats().inFlight, 0);
});

test('forgets an item whose conversion fails', async t => {
  const converter: ImageConverterLike = {
    convert: async (item: ImageBatchItem): Promise<ImageBatchItem> => {
      if (item.fileName.includes('bad')) {
        throw new Error('conversion failed');
      }
      return item;
    },
  };
  const converted: ImageBatchItem[] = [];
  const queue = new ConverterQueue(
    10,
    10,
    async batch => {
      converted.push(...batch);
    },
    { converter, maxInFlight: 50 }
  );
  t.after(() => queue.drain());

  assert.equal(queue.add(makeItem(0)), true);
  assert.equal(queue.add({ fileName: 'frames-hq/bad.jpeg', buffer: Buffer.alloc(4) }), true);
  assert.equal(queue.add(makeItem(1)), true);

  await queue.drain();

  assert.equal(converted.length, 2);
  assert.ok(converted.every(item => !item.fileName.includes('bad')));
  assert.equal(queue.stats().inFlight, 0);
  assert.equal(queue.stats().resolved, 0);
});

test('drops items beyond maxInFlight and counts them', async t => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const converter: ImageConverterLike = {
    convert: async (item: ImageBatchItem): Promise<ImageBatchItem> => {
      await gate;
      return { ...item, buffer: Buffer.alloc(10) };
    },
  };
  const accepted: ImageBatchItem[] = [];
  const queue = new ConverterQueue(
    10,
    10,
    async batch => {
      accepted.push(...batch);
    },
    { converter, maxInFlight: 3 }
  );
  t.after(async () => {
    release();
    await queue.drain();
  });

  const results = [0, 1, 2, 3, 4].map(index => queue.add(makeItem(index)));

  assert.deepEqual(results, [true, true, true, false, false]);
  assert.equal(queue.stats().dropped, 2);

  release();
  await queue.drain();

  assert.equal(accepted.length, 3);
  assert.deepEqual(queue.stats(), {
    inFlight: 0,
    resolved: 0,
    dropped: 2,
    timerRunning: false,
  });
});

test('flushes batches of at most batchSize', async t => {
  const sizes: number[] = [];
  const queue = new ConverterQueue(
    5,
    10,
    async batch => {
      sizes.push(batch.length);
    },
    { converter: fakeConverter(), maxInFlight: 50 }
  );
  t.after(() => queue.drain());

  for (let i = 0; i < 12; i += 1) {
    queue.add(makeItem(i));
  }

  await queue.drain();

  assert.equal(sizes.reduce((sum, size) => sum + size, 0), 12);
  assert.ok(sizes.every(size => size <= 5), `batch sizes were ${sizes.join(',')}`);
});

test('drain waits for a callback that is already running', async t => {
  let started = false;
  let finished = false;
  const queue = new ConverterQueue(
    10,
    10,
    async () => {
      started = true;
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      finished = true;
    },
    { converter: fakeConverter(), maxInFlight: 50 }
  );
  t.after(() => queue.drain());

  for (let i = 0; i < 3; i += 1) {
    queue.add(makeItem(i));
  }

  // Wait until a timer tick has started the callback.
  const deadline = Date.now() + 5000;
  while (!started && Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
  assert.equal(started, true, 'the callback never started');

  await queue.drain();

  assert.equal(finished, true, 'drain resolved while the callback was still running');
});

test('holds no buffers after 2000 conversions', async t => {
  const queue = new ConverterQueue(50, 10, async () => undefined, {
    converter: fakeConverter(),
    maxInFlight: 200,
  });
  t.after(() => queue.drain());

  const refs: WeakRef<Buffer>[] = [];

  for (let round = 0; round < 20; round += 1) {
    for (let i = 0; i < 100; i += 1) {
      const item = makeItem(round * 100 + i, 100 * 1024);
      refs.push(new WeakRef(item.buffer));
      queue.add(item);
    }
    await queue.drain();
  }

  assert.deepEqual(queue.stats(), {
    inFlight: 0,
    resolved: 0,
    dropped: 0,
    timerRunning: false,
  });

  // A retained input buffer would keep its WeakRef alive across the GC.
  await new Promise(resolve => setImmediate(resolve));
  gc();

  const alive = refs.filter(ref => ref.deref() !== undefined).length;
  assert.ok(alive < 10, `${alive} of ${refs.length} input buffers are still retained`);
});
