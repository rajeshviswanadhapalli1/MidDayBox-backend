const sharp = require('sharp');

const compressImage = async (buffer, options = {}) => {
  const {
    quality = 70,
    maxWidth = 800,
    maxHeight = 800,
    format = 'jpeg'
  } = options;

  try {
    if (!buffer) {
      throw new Error('No image buffer provided');
    }

    let pipeline = sharp(buffer);

    if (maxWidth || maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, progressive: true });
    }

    return await pipeline.toBuffer();
  } catch (error) {
    console.error('Image compression error:', error);
    throw error;
  }
};

const getCompressedImageMetadata = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation
    };
  } catch (error) {
    console.error('Error getting image metadata:', error);
    return null;
  }
};

module.exports = {
  compressImage,
  getCompressedImageMetadata
};
