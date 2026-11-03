import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameTracker } from '../src/services/frame-tracker';
import { InferenceEvent } from '../src/utils/types';

const frame = (id: string, timestamp: string): InferenceEvent => ({
  metadata: { id, timestamp, namespace: 'test' },
  data: {},
  device: 'device',
});

test('reports a frame as new once per field', () => {
  const tracker = new FrameTracker();
  const current = frame('cam-1', '2026-11-03T10:00:00.000Z');

  assert.equal(tracker.isNew('field-1', current), true);
  assert.equal(tracker.isNew('field-1', current), false);
});

test('reports a new timestamp as new', () => {
  const tracker = new FrameTracker();

  assert.equal(tracker.isNew('field-1', frame('cam-1', '2026-11-03T10:00:00.000Z')), true);
  assert.equal(tracker.isNew('field-1', frame('cam-1', '2026-11-03T10:00:30.000Z')), true);
});

test('tracks the same frame key per field', () => {
  const tracker = new FrameTracker();

  assert.equal(tracker.isNew('field-1', frame('cam-1', '2026-11-03T10:00:00.000Z')), true);
  assert.equal(tracker.isNew('field-2', frame('cam-1', '2026-11-03T10:00:00.000Z')), true);
});

test('always reports a frame without id and timestamp as new', () => {
  const tracker = new FrameTracker();
  const anonymous = frame('', '');

  assert.equal(tracker.isNew('field-1', anonymous), true);
  assert.equal(tracker.isNew('field-1', anonymous), true);
  assert.equal(tracker.frameKey(anonymous), null);
  assert.equal(tracker.size(), 0);
});

test('prune forgets fields that are no longer in the cache', () => {
  const tracker = new FrameTracker();

  tracker.isNew('field-1', frame('cam-1', '2026-11-03T10:00:00.000Z'));
  tracker.isNew('field-2', frame('cam-2', '2026-11-03T10:00:00.000Z'));
  tracker.isNew('field-3', frame('cam-3', '2026-11-03T10:00:00.000Z'));
  assert.equal(tracker.size(), 3);

  tracker.prune(new Set(['field-1', 'field-3']));
  assert.equal(tracker.size(), 2);

  // A pruned field is exported again when its camera comes back.
  assert.equal(tracker.isNew('field-2', frame('cam-2', '2026-11-03T10:00:00.000Z')), true);
});
