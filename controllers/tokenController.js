const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const Admin = require('../models/Admin');
const SchoolRegistration = require('../models/SchoolRegistration');
const {
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} = require('../utils/tokenService');

async function loadUserByRole(userId, role) {
  if (role === 'parent') return Parent.findById(userId);
  if (role === 'deliveryboy') return DeliveryBoy.findById(userId);
  if (role === 'school') return SchoolRegistration.findById(userId);
  if (role === 'admin' || role === 'sub_admin') {
    return Admin.findOne({ _id: userId, isActive: true });
  }
  return null;
}

exports.refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'refreshToken is required'
      });
    }

    const tokens = await rotateRefreshToken(refreshToken, req);
    const user = await loadUserByRole(tokens.userId, tokens.role);

    if (!user) {
      await revokeRefreshToken(tokens.refreshToken);
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    if (tokens.role === 'sub_admin' && user.role !== 'sub_admin') {
      return res.status(401).json({ success: false, message: 'Invalid user' });
    }

    res.json({
      success: true,
      message: 'Token refreshed',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt
    });
  } catch (error) {
    const code = error.code || 'REFRESH_FAILED';
    const status = ['INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_EXPIRED'].includes(code) ? 401 : 500;
    res.status(status).json({
      success: false,
      code,
      message: error.message || 'Failed to refresh token'
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'refreshToken is required'
      });
    }

    await revokeRefreshToken(refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    });
  }
};

exports.logoutAll = async (req, res) => {
  try {
    await revokeAllUserTokens(req.user.id, req.user.role);
    res.json({
      success: true,
      message: 'Logged out from all devices'
    });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    });
  }
};
