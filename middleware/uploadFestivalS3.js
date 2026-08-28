require('dotenv').config();
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

const festivalUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      let folder = 'festival-wishes/images';
      if (file.fieldname === 'video') folder = 'festival-wishes/videos';
      if (file.fieldname === 'thumbnail') folder = 'festival-wishes/thumbnails';
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${folder}/${Date.now()}-${safeName}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image') {
      return IMAGE_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Image must be JPEG, PNG, or WebP'));
    }
    if (file.fieldname === 'video') {
      return VIDEO_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Video must be MP4, MOV, or WebM'));
    }
    if (file.fieldname === 'thumbnail') {
      return IMAGE_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Thumbnail must be JPEG, PNG, or WebP'));
    }
    cb(new Error('Unexpected upload field'));
  }
});

module.exports = { festivalUpload, s3 };
