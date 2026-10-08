const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/aws-s3');
const { deleteCloudinaryImage, publicIdFromUrl } = require('./cloudinaryMedia');

function publicUrlFromKey(key) {
  if (!key) return null;
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

function keyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  const prefixes = [
    `https://${bucket}.s3.${region}.amazonaws.com/`,
    `https://s3.${region}.amazonaws.com/${bucket}/`
  ];
  for (const p of prefixes) {
    if (url.startsWith(p)) return url.slice(p.length);
  }
  return null;
}

async function deleteS3Object(key) {
  if (!key) return;
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      })
    );
  } catch (e) {
    console.error('S3 delete error:', e.message);
  }
}

async function deleteStoredMedia(key) {
  if (!key) return;
  if (String(key).startsWith('middaybox/')) {
    await deleteCloudinaryImage(key);
    return;
  }
  await deleteS3Object(key);
}

async function deleteImageByUrl(url) {
  if (!url) return;
  const publicId = publicIdFromUrl(url);
  if (publicId) {
    await deleteCloudinaryImage(publicId);
    return;
  }
  await deleteS3Object(keyFromUrl(url));
}

module.exports = { publicUrlFromKey, keyFromUrl, deleteS3Object, deleteStoredMedia, deleteImageByUrl };
