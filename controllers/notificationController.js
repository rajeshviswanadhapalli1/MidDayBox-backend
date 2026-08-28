const mongoose = require('mongoose');
const FcmToken = require('../models/FcmToken');

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

// Save (upsert) an FCM token for a user/school.
// Endpoint expected by app: POST /api/notifications/fcm-token
exports.saveFcmToken = async (req, res) => {
  try {
    const { token, platform, role, userId, schoolUniqueId } = req.body || {};

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ success: false, message: 'role is required' });
    }
    if (!userId && !schoolUniqueId) {
      return res.status(400).json({
        success: false,
        message: 'userId or schoolUniqueId is required'
      });
    }

    const userObjectId = toObjectId(userId);

    const roleNorm = String(role).trim().toLowerCase();

    const doc = await FcmToken.findOneAndUpdate(
      { token: token.trim() },
      {
        $set: {
          platform: platform ? String(platform) : undefined,
          role: roleNorm,
          userId: userObjectId || undefined,
          schoolUniqueId: schoolUniqueId ? String(schoolUniqueId).trim() : undefined,
          isActive: true,
          lastSeenAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: 'FCM token saved',
      token: doc.token
    });
  } catch (error) {
    console.error('saveFcmToken error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

