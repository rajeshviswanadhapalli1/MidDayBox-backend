const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const Admin = require('../models/Admin');
const SchoolRegistration = require('../models/SchoolRegistration');
const { verifyAccessToken, refreshAccessFromRefreshToken } = require('../utils/tokenService');

function getRefreshTokenFromRequest(req) {
  return (
    req.header('X-Refresh-Token') ||
    req.header('x-refresh-token') ||
    req.body?.refreshToken ||
    null
  );
}

async function loadUser(decoded) {
  let user;
  if (decoded.role === 'parent') {
    user = await Parent.findById(decoded.id);
  } else if (decoded.role === 'deliveryboy') {
    user = await DeliveryBoy.findById(decoded.id);
  } else if (decoded.role === 'admin' || decoded.role === 'sub_admin') {
    user = await Admin.findById(decoded.id);
    if (user && !user.isActive) user = null;
  } else if (decoded.role === 'school') {
    user = await SchoolRegistration.findById(decoded.id);
  }
  return user;
}

function attachUserToRequest(req, decoded, user) {
  req.user = {
    id: user._id,
    role: decoded.role,
    name: user.name || user.contactName || user.schoolName,
    email: user.email,
    mobile: user.mobile,
    permissions: decoded.role === 'sub_admin' ? (user.permissions || []) : undefined
  };
}

/** When tokens were auto-refreshed, send new tokens in headers + JSON body fields. */
function enableTokenRefreshOnResponse(req, res) {
  if (!req.tokenRefreshed || !req.newTokens) return;

  const { accessToken, refreshToken, expiresIn } = req.newTokens;

  res.setHeader('X-Access-Token', accessToken);
  res.setHeader('X-Refresh-Token', refreshToken);
  res.setHeader('X-Token-Refreshed', 'true');
  res.setHeader('X-Token-Expires-In', String(expiresIn));

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      body.tokenRefreshed = true;
      body.accessToken = accessToken;
      body.refreshToken = refreshToken;
      body.token = accessToken;
      body.expiresIn = expiresIn;
    }
    return originalJson(body);
  };
}

// Authenticate with access token; if expired, auto-refresh using X-Refresh-Token
exports.authenticateUser = async (req, res, next) => {
  try {
    const accessToken = req.header('Authorization')?.replace('Bearer ', '')?.trim();
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!accessToken && !refreshToken) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'Access denied. No token provided.'
      });
    }

    let decoded = null;
    let usedAutoRefresh = false;

    if (accessToken) {
      try {
        decoded = verifyAccessToken(accessToken);
      } catch (error) {
        const canTryRefresh =
          refreshToken &&
          (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError');

        if (!canTryRefresh) {
          if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
              success: false,
              code: 'TOKEN_EXPIRED',
              message:
                'Access token expired. Send X-Refresh-Token header or call POST /api/auth/refresh.'
            });
          }
          return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            message: 'Invalid token.'
          });
        }
      }
    }

    if (!decoded && refreshToken) {
      try {
        const refreshed = await refreshAccessFromRefreshToken(refreshToken);
        decoded = { id: refreshed.userId, role: refreshed.role };
        req.tokenRefreshed = true;
        req.newTokens = refreshed;
        usedAutoRefresh = true;
      } catch (refreshError) {
        const code = refreshError.code || 'INVALID_REFRESH_TOKEN';
        return res.status(401).json({
          success: false,
          code,
          message: refreshError.message || 'Invalid refresh token'
        });
      }
    }

    if (!decoded) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'Access denied. No valid token.'
      });
    }

    const user = await loadUser(decoded);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Invalid token. User not found.'
      });
    }

    attachUserToRequest(req, decoded, user);

    if (usedAutoRefresh) {
      enableTokenRefreshOnResponse(req, res);
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      code: 'AUTH_ERROR',
      message: 'Invalid token.'
    });
  }
};

exports.requireParent = (req, res, next) => {
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Parent role required.'
    });
  }
  next();
};

exports.requireDeliveryBoy = (req, res, next) => {
  if (req.user.role !== 'deliveryboy') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Delivery boy role required.'
    });
  }
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
};

exports.requireAdminOrSubAdmin = (req, res, next) => {
  if (!['admin', 'sub_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
};

exports.requirePermission = (permissionKey) => (req, res, next) => {
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'sub_admin') {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (!perms.map((p) => String(p).toLowerCase()).includes(String(permissionKey).toLowerCase())) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Permission required.'
    });
  }
  next();
};

exports.requireSchool = (req, res, next) => {
  if (req.user.role !== 'school') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. School role required.'
    });
  }
  next();
};
