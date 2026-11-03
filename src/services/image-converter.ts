import sharp from 'sharp';
import { ImageBatchItem } from '../utils/types';

// libvips keeps an operation cache by default; a long-running service does not
// benefit from it and it only holds memory.
sharp.cache(false);

// Main thread logic. sharp runs libvips on its own thread pool, so the event
// loop is not blocked by the conversion.
class ImageConverter {
  async convert(imageBatchItem: ImageBatchItem): Promise<ImageBatchItem> {
    const buffer = imageBatchItem.buffer; // Use the buffer directly

    const lowQualityBuffer = await sharp(buffer)
      .resize(320, 180) // Resize to low resolution (e.g., 320x180)
      .jpeg({ quality: 50 }) // Reduce quality to 50%
      .toBuffer();

    return {
      fileName: imageBatchItem.fileName.replace('frames-hq', 'frames-lq'), // Update file path for low-quality image
      buffer: lowQualityBuffer, // Use the buffer directly
    };
  }
}

export default ImageConverter;
