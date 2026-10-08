require('dotenv').config();
const multer = require('multer');
const { Upload } = require('@aws-sdk/lib-storage');
const { s3 } = require('../config/aws-s3');
const { compressImage } = require('../utils/imageCompression');
const { uploadImageBuffer } = require('../utils/cloudinaryMedia');

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
const THUMB_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

class DemoMediaStorage {
  _handleFile(req, file, cb) {
    if (file.fieldname === 'thumbnail' || THUMB_TYPES.includes(file.mimetype)) {
      this._uploadThumbnail(file, cb);
      return;
    }
    this._uploadVideo(file, cb);
  }

  _uploadThumbnail(file, cb) {
    const chunks = [];
    file.stream.on('data', (chunk) => chunks.push(chunk));
    file.stream.on('error', cb);
    file.stream.on('end', async () => {
      try {
        const compressedBuffer = await compressImage(Buffer.concat(chunks), {
          quality: 70,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'jpeg'
        });
        const uploaded = await uploadImageBuffer(compressedBuffer, 'demo-videos/thumbnails');
        cb(null, {
          location: uploaded.url,
          path: uploaded.url,
          key: uploaded.publicId,
          size: compressedBuffer.length
        });
      } catch (error) {
        cb(error);
      }
    });
  }

  _uploadVideo(file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `demo-videos/videos/${Date.now()}-${safeName}`;
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: file.stream,
        ContentType: file.mimetype
      }
    });

    upload.done()
      .then(() => {
        cb(null, {
          location: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
          key,
          size: file.size
        });
      })
      .catch(cb);
  }

  _removeFile(req, file, cb) {
    cb();
  }
}

const demoUpload = multer({
  storage: new DemoMediaStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      return VIDEO_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Video must be MP4, MOV, or WebM'));
    }
    if (file.fieldname === 'thumbnail') {
      return THUMB_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Thumbnail must be JPEG, PNG, or WebP'));
    }
    cb(new Error('Unexpected upload field'));
  }
});

module.exports = { demoUpload, s3 };
