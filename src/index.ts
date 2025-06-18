import 'dotenv/config';
import fs from 'fs';
import logger from './services/logger';
import CacheService from './services/cache';
import Scheduler from './services/scheduller';
import { ImageBatchItem, InferenceEvent } from './utils/types';
import GCSExporter from './services/gcs-exporter';
import ConverterQueue from './services/converter-queue';

// Read environment variables into constants
const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || 'teknoir';
const gcloudStorageBucket = process.env.GCLOUD_STORAGE_BUCKET || 'victra-poc.teknoir.cloud';

logger.info(`Starting Snapshot Exporter`);
logger.info(`Google Cloud Project: ${googleCloudProject}`);
logger.info(`GCloud Storage Bucket: ${gcloudStorageBucket}`);


const main = async (): Promise<void> => {
  const cacheService = new CacheService();
  await cacheService.init();

  const gcsExporter = new GCSExporter(googleCloudProject, gcloudStorageBucket);
  const converterQueue = new ConverterQueue(3000, 2000, async (batch: ImageBatchItem[]) => {
    logger.info(`Processing batch of Low Quality ${batch.length} images`);
    await gcsExporter.batchUploadImages(batch);
  });

  const frameToBatchItem = (frame: InferenceEvent): ImageBatchItem | null => {
    const timestamp = (frame.metadata?.timestamp || new Date().toISOString()).replace(/[:]/g, '-');

    const imageBase64 = (frame.data?.image || '').replace(/^data:image\/[a-z]+;base64,/, '');

    if (!imageBase64) {
      return null;
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');

    return {
      fileName: `media/snapshots/${frame.data?.peripheral?.id || 'unknown'}/frames-hq/${timestamp}.jpeg`,
      buffer: imageBuffer,
    }
  };

  const sendCachedVideoTask = async (): Promise<void> => {
    const snapshotData: ImageBatchItem[] = [];

    logger.debug('Starting to process cached video frames');

    await cacheService.forEachEntry('video', async (_, frame: InferenceEvent) => {
      const batchItem = frameToBatchItem(frame);

      if (!batchItem) {
        logger.warn(`Skipping frame with no image data`, { frameId: frame.metadata?.id });
        return;
      }

      snapshotData.push(batchItem);
      converterQueue.add(batchItem);

      if (snapshotData.length >= 3000) {
        logger.info(`Processing batch of ${snapshotData.length} frames`);
        const batchData = snapshotData.splice(0, 3000); // Take the first 3000 frames
        snapshotData.length = 0; // Clear the array after processing
        await gcsExporter.batchUploadImages(batchData);
      }
    });

    if (snapshotData.length > 0) {
      logger.info(`Processing remaining ${snapshotData.length} frames`);
      await gcsExporter.batchUploadImages(snapshotData);
    }
  };

  const scheduler = new Scheduler(10000, sendCachedVideoTask); // Run every 5 seconds

  scheduler.start();
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received.');
});

main();
