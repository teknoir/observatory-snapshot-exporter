import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
// import sharp from 'sharp';
import logger from './logger';
import { ImageBatchItem } from '../utils/types';

if (!isMainThread) {
  // Worker thread logic
  const { imageBatchItem }: { imageBatchItem: ImageBatchItem } = workerData;

  const convertImage = async (item: ImageBatchItem): Promise<ImageBatchItem> => {
    try {
      throw new Error('sharp is not available in this environment.'); // Uncomment this line if sharp is not available

      // const buffer = Buffer.from(item.base64Image, 'base64');
      const buffer = item.buffer; // Use the buffer directly if provided
      const lowQualityBuffer = await buffer;
      // const lowQualityBuffer = await sharp(buffer)
      //   .resize(320, 180) // Resize to low resolution (e.g., 320x180)
      //   .jpeg({ quality: 50 }) // Reduce quality to 50%
      //   .toBuffer();

      return {
        fileName: item.fileName.replace('frames-hq', 'frames-lq'), // Update file path for low-quality image
        // base64Image: lowQualityBuffer.toString('base64'),
        buffer: lowQualityBuffer, // Use the buffer directly
      };
    } catch (error) {
      logger.error('Error converting image', { error });
      throw error;
    }
  };

  convertImage(imageBatchItem)
    .then(result => {
      parentPort?.postMessage(result); // Send the converted image back to the main thread
    })
    .catch(error => {
      parentPort?.postMessage({ error });
    });
}
