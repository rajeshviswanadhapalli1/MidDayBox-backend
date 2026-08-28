const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkey';
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '30', 10);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpirySeconds(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn;
  const s = String(expiresIn);
  const match = s.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  if (unit === 'd') return n * 86400;
  return 900;
}

const ACCESS_EXPIRES_SECONDS = parseExpirySeconds(ACCESS_TOKEN_EXPIRES_IN);

function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function generateOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

async function saveRefreshToken({ userId, role, refreshToken, req }) {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    tokenHash,
    userId,
    role,
    expiresAt,
    userAgent: req?.headers?.['user-agent'] || null,
    ipAddress: req?.ip || req?.connection?.remoteAddress || null
  });

  return expiresAt;
}

async function issueTokenPair({ userId, role, tokenPayload = {}, req }) {
  const accessToken = generateAccessToken({
    id: userId,
    role,
    ...tokenPayload
  });

  const refreshToken = generateOpaqueRefreshToken();
  const refreshExpiresAt = await saveRefreshToken({ userId, role, refreshToken, req });

  return {
    accessToken,
    refreshToken,
    token: accessToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
    refreshExpiresAt: refreshExpiresAt
  };
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_ACCESS_SECRET);
}

/** Validate refresh token and issue new access token (no refresh rotation — safe for parallel API calls). */
async function refreshAccessFromRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored || stored.revokedAt) {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    stored.revokedAt = new Date();
    await stored.save();
    const err = new Error('Refresh token expired');
    err.code = 'REFRESH_TOKEN_EXPIRED';
    throw err;
  }

  const accessToken = generateAccessToken({
    id: stored.userId,
    role: stored.role
  });

  return {
    accessToken,
    refreshToken,
    token: accessToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
    userId: stored.userId,
    role: stored.role
  };
}

async function rotateRefreshToken(oldRefreshToken, req) {
  const oldHash = hashToken(oldRefreshToken);
  const stored = await RefreshToken.findOne({ tokenHash: oldHash });

  if (!stored || stored.revokedAt) {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    stored.revokedAt = new Date();
    await stored.save();
    const err = new Error('Refresh token expired');
    err.code = 'REFRESH_TOKEN_EXPIRED';
    throw err;
  }

  const newRefreshToken = generateOpaqueRefreshToken();
  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  stored.revokedAt = new Date();
  stored.replacedByTokenHash = newHash;
  await stored.save();

  await RefreshToken.create({
    tokenHash: newHash,
    userId: stored.userId,
    role: stored.role,
    expiresAt,
    userAgent: req?.headers?.['user-agent'] || null,
    ipAddress: req?.ip || req?.connection?.remoteAddress || null
  });

  const accessToken = generateAccessToken({
    id: stored.userId,
    role: stored.role
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    token: accessToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
    refreshExpiresAt: expiresAt,
    userId: stored.userId,
    role: stored.role
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeAllUserTokens(userId, role) {
  await RefreshToken.updateMany(
    { userId, role, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

module.exports = {
  JWT_ACCESS_SECRET,
  ACCESS_EXPIRES_SECONDS,
  generateAccessToken,
  issueTokenPair,
  verifyAccessToken,
  refreshAccessFromRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
};
