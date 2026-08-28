// middleware/uploadS3.js
require('dotenv').config();
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { compressImage } = require("../utils/imageCompression");

// ✅ Initialize AWS S3 Client (v3 style)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

class CompressedS3Storage {
  constructor(options) {
    this.s3 = options.s3;
    this.bucket = options.bucket;
    this.folderName = options.folderName;
  }

  async _handleFile(req, file, cb) {
    try {
      const chunks = [];
      file.stream.on('data', chunk => chunks.push(chunk));
      file.stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          const compressedBuffer = await compressImage(buffer, {
            quality: 65,
            maxWidth: 800,
            maxHeight: 800,
            format: 'jpeg'
          });

          const timestamp = Date.now();
          const fileName = `${this.folderName}/${timestamp}-${file.originalname}`;

          const params = {
            Bucket: this.bucket,
            Key: fileName,
            Body: compressedBuffer,
            ContentType: 'image/jpeg'
          };

          await this.s3.send(new PutObjectCommand(params));

          const location = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

          cb(null, {
            location,
            bucket: this.bucket,
            key: fileName,
            size: compressedBuffer.length
          });
        } catch (error) {
          cb(error);
        }
      });

      file.stream.on('error', cb);
    } catch (error) {
      cb(error);
    }
  }

  _removeFile(req, file, cb) {
    cb();
  }
}

/**
 * Create an uploader instance for a given folder with compression.
 * @param {string} folderName - Folder name inside your S3 bucket
 */
function createUpload(folderName) {
  return multer({
    storage: new CompressedS3Storage({
      s3: s3,
      bucket: process.env.AWS_S3_BUCKET,
      folderName: folderName
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only .jpeg, .jpg, and .png files are allowed!"), false);
      }
    },
  });
}

module.exports = { createUpload };
