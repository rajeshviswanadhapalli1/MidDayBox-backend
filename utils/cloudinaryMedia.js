require('dotenv').config();
const cloudinary = require('cloudinary').v2;

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function uploadImageBuffer(buffer, folderName) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return Promise.reject(new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'));
  }

  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `middaybox/${folderName}`,
        resource_type: 'image',
        format: 'jpg'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes
        });
      }
    );
    stream.end(buffer);
  });
}

function publicIdFromUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function deleteCloudinaryImage(publicId) {
  if (!publicId) return;
  configureCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    console.error('Cloudinary delete error:', error.message);
  }
}

module.exports = {
  uploadImageBuffer,
  publicIdFromUrl,
  deleteCloudinaryImage
};
