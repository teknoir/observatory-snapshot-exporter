import { InferenceEvent } from '../utils/types';

/**
 * Remembers the last frame exported for every cache field, so a frame is only
 * exported once even though it stays in the cache hash until it expires.
 *
 * A frame counts as exported as soon as it is handed to the uploads, whatever
 * the upload result: a failed upload is not retried, the next new frame of
 * that camera is exported instead.
 */
export class FrameTracker {
  private lastFrameByField = new Map<string, string>();

  /**
   * Identify a frame by its camera and timestamp.
   * @returns null when the frame has neither, so it cannot be compared.
   */
  frameKey(frame: InferenceEvent): string | null {
    const id = frame.metadata?.id ?? '';
    const timestamp = frame.metadata?.timestamp ?? '';

    if (!id && !timestamp) {
      return null;
    }

    return `${id}|${timestamp}`;
  }

  /**
   * Record the frame as seen and report whether it is new for that field.
   */
  isNew(field: string, frame: InferenceEvent): boolean {
    const key = this.frameKey(frame);

    if (key === null) {
      // Cannot tell frames apart, so always export.
      return true;
    }

    if (this.lastFrameByField.get(field) === key) {
      return false;
    }

    this.lastFrameByField.set(field, key);
    return true;
  }

  /**
   * Forget fields that are no longer in the cache, so the map stays as small
   * as the hash.
   */
  prune(seenFields: Set<string>): void {
    for (const field of this.lastFrameByField.keys()) {
      if (!seenFields.has(field)) {
        this.lastFrameByField.delete(field);
      }
    }
  }

  size(): number {
    return this.lastFrameByField.size;
  }
}
