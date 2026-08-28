const admin = require('firebase-admin');
const FcmToken = require('../models/FcmToken');
const fs = require('fs');
const path = require('path');

let firebaseInitPromise = null;

function initFirebaseAdmin() {
  if (firebaseInitPromise) return firebaseInitPromise;

  firebaseInitPromise = new Promise((resolve, reject) => {
    try {
      if (admin.apps && admin.apps.length > 0) {
        resolve(admin.app());
        return;
      }

      // Recommended: set FIREBASE_SERVICE_ACCOUNT_JSON as a JSON string.
      // Example:
      // FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
      let serviceAccount = null;

      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

      if (raw && String(raw).trim()) {
        serviceAccount = JSON.parse(raw);
      } else if (serviceAccountPath && String(serviceAccountPath).trim()) {
        const absPath = path.isAbsolute(serviceAccountPath)
          ? serviceAccountPath
          : path.resolve(process.cwd(), serviceAccountPath);
        const fileRaw = fs.readFileSync(absPath, 'utf8');
        serviceAccount = JSON.parse(fileRaw);
      } else {
        // If not configured, do not throw: we want the app to keep working.
        resolve(null);
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      resolve(admin.app());
    } catch (e) {
      reject(e);
    }
  });

  return firebaseInitPromise;
}

async function sendSchoolApprovedNotification({ schoolRegistrationId, schoolUniqueId }) {
  // Fetch all active school tokens for the school.
  const tokensDocs = await FcmToken.find({
    isActive: true,
    role: 'school',
    $or: [
      schoolUniqueId ? { schoolUniqueId } : null,
      schoolRegistrationId ? { userId: schoolRegistrationId } : null
    ].filter(Boolean)
  }).select('token');

  const tokens = tokensDocs.map((d) => d.token);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const app = await initFirebaseAdmin();
  if (!app) {
    // Firebase not configured on this environment.
    return { sent: 0, failed: tokens.length, skipped: true };
  }

  const message = {
    notification: {
      title: 'School Approved',
      body: 'Your School Account is Approved By Admin Please Re-Login to Update Your Account'
    },
    data: {
      type: 'school_approved',
      schoolUniqueId: schoolUniqueId || '',
      status: 'approved'
    },
    android: {
      priority: 'high',
      notification: {
        channel_id: 'default',
        sound: 'default'
      }
    }
  };

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    ...message
  });

  const invalidCodes = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/registration-token-mismatch'
  ]);

  const invalidTokens = [];
  response.responses.forEach((r, idx) => {
    if (!r.success && r.error && invalidCodes.has(r.error.code)) {
      invalidTokens.push(tokens[idx]);
    }
  });

  if (invalidTokens.length > 0) {
    await FcmToken.updateMany(
      { token: { $in: invalidTokens } },
      { $set: { isActive: false } }
    );
  }

  return {
    sent: response.successCount,
    failed: response.failureCount
  };
}

module.exports = { sendSchoolApprovedNotification };

