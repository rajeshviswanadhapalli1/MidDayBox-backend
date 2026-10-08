require('dotenv').config();
const multer = require('multer');
const { compressImage } = require('../utils/imageCompression');
const { uploadImageBuffer } = require('../utils/cloudinaryMedia');

class CloudinaryImageStorage {
  constructor(folderName) {
    this.folderName = folderName;
  }

  _handleFile(req, file, cb) {
    const chunks = [];
    file.stream.on('data', (chunk) => chunks.push(chunk));
    file.stream.on('error', cb);
    file.stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const compressedBuffer = await compressImage(buffer, {
          quality: 65,
          maxWidth: 800,
          maxHeight: 800,
          format: 'jpeg'
        });
        const uploaded = await uploadImageBuffer(compressedBuffer, this.folderName);
        cb(null, {
          location: uploaded.url,
          path: uploaded.url,
          key: uploaded.publicId,
          public_id: uploaded.publicId,
          size: compressedBuffer.length
        });
      } catch (error) {
        cb(error);
      }
    });
  }

  _removeFile(req, file, cb) {
    cb();
  }
}

function createUpload(folderName) {
  return multer({
    storage: new CloudinaryImageStorage(folderName),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only .jpeg, .jpg, and .png files are allowed!'), false);
      }
    }
  });
}

module.exports = { createUpload };
