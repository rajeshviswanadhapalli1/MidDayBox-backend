const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../middleware/uploadDemoS3');

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

module.exports = { publicUrlFromKey, keyFromUrl, deleteS3Object };
