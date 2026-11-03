import logger from './logger';
import { FrameTracker } from './frame-tracker';
import { ImageBatchItem, InferenceEvent } from '../utils/types';

export interface ExportTaskDependencies {
  cache: {
    forEachEntry<T>(set: string, cb: (field: string, value: T) => void): Promise<boolean>;
  };
  exporter: {
    batchUploadImages(items: ImageBatchItem[]): Promise<{ uploaded: number; failed: number }>;
  };
  queue: {
    add(item: ImageBatchItem): boolean;
  };
  tracker: FrameTracker;
}

export const frameToBatchItem = (frame: InferenceEvent): ImageBatchItem | null => {
  const timestamp = (frame.metadata?.timestamp || new Date().toISOString()).replace(/[:]/g, '-');

  const imageBase64 = (frame.data?.image || '').replace(/^data:image\/[a-z]+;base64,/, '');

  if (!imageBase64) {
    return null;
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  return {
    fileName: `media/snapshots/${frame.data?.peripheral?.id || 'unknown'}/frames-hq/${timestamp}.jpeg`,
    buffer: imageBuffer,
  };
};

/**
 * Build the scheduled task that exports the latest cached video frame of every
 * camera, at most once per frame.
 */
export function createExportTask(deps: ExportTaskDependencies): () => Promise<void> {
  return async (): Promise<void> => {
    const { cache, exporter, queue, tracker } = deps;
    const snapshotData: ImageBatchItem[] = [];
    const seenFields = new Set<string>();

    logger.debug('Starting to process cached video frames');

    let scanned = false;

    try {
      scanned = await cache.forEachEntry<InferenceEvent>('video', (field, frame) => {
        seenFields.add(field);

        if (!tracker.isNew(field, frame)) {
          return;
        }

        const batchItem = frameToBatchItem(frame);

        if (!batchItem) {
          logger.warn('Skipping frame with no image data', { frameId: frame.metadata?.id });
          return;
        }

        snapshotData.push(batchItem);
        queue.add(batchItem);
      });
    } finally {
      // Upload whatever was collected even when the scan threw, so frames
      // already handed to the queue are not lost.
      if (snapshotData.length === 0) {
        logger.debug('No new video frames to export');
      } else {
        const { uploaded, failed } = await exporter.batchUploadImages(snapshotData);
        logger.info(`Exported ${uploaded} video frames (${failed} failed)`);
      }
    }

    if (scanned) {
      // A complete scan of an empty hash prunes everything, which is correct.
      tracker.prune(seenFields);
    }
  };
}
