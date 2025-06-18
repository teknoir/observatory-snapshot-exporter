import { EventEmitter } from 'events';
import sharp from 'sharp';
import logger from './logger';
import { ImageBatchItem } from '../utils/types';

export class ImageConverterWorker extends EventEmitter {
  private imageBatchItem: ImageBatchItem;

  constructor(imageBatchItem: ImageBatchItem) {
    super();
    this.imageBatchItem = imageBatchItem;

    setTimeout(() => {
      this.processImage();
    }, 0); // Use setTimeout to ensure the event loop is clear before processing
  }

  private async processImage(): Promise<void> {
    try {
      const buffer = this.imageBatchItem.buffer; // Use the buffer directly
      const lowQualityBuffer = await sharp(buffer)
        .resize(320, 180) // Resize to low resolution (e.g., 320x180)
        .jpeg({ quality: 50 }) // Reduce quality to 50%
        .toBuffer();

      const result: ImageBatchItem = {
        fileName: this.imageBatchItem.fileName.replace('frames-hq', 'frames-lq'), // Update file path for low-quality image
        buffer: lowQualityBuffer, // Use the buffer directly
      };

      this.emit('message', result); // Emit success event with the result
    } catch (error) {
      logger.error('Error converting image', { error });
      this.emit('error', error); // Emit error event
    }
  }
}
