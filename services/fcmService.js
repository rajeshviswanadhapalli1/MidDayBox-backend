const admin = require('firebase-admin');
const FcmToken = require('../models/FcmToken');
const fs = require('fs');
const path = require('path');

let firebaseInitPromise = null;

function parseServiceAccount(raw) {
  let value = String(raw).trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  const parsed = JSON.parse(value);
  if (parsed && typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function readServiceAccountFile(filePath) {
  if (!filePath || !String(filePath).trim()) return null;
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) return null;
  return parseServiceAccount(fs.readFileSync(absPath, 'utf8'));
}

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && String(rawJson).trim()) {
    return parseServiceAccount(rawJson);
  }

  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawBase64 && String(rawBase64).trim()) {
    const decoded = Buffer.from(String(rawBase64).trim(), 'base64').toString('utf8');
    return parseServiceAccount(decoded);
  }

  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const fromConfiguredPath = readServiceAccountFile(configuredPath);
  if (fromConfiguredPath) return fromConfiguredPath;

  if (configuredPath && String(configuredPath).trim()) {
    console.error(
      `Firebase service account file not found at ${configuredPath}. ` +
        'That file is not deployed with the app. On Render, add it as a Secret File ' +
        'or set FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
  }

  // Render mounts Secret Files at /etc/secrets/<filename>.
  return (
    readServiceAccountFile('/etc/secrets/ServiceAccountKey.json') ||
    readServiceAccountFile('/etc/secrets/firebase-service-account.json')
  );
}

function initFirebaseAdmin() {
  if (firebaseInitPromise) return firebaseInitPromise;

  firebaseInitPromise = Promise.resolve().then(() => {
    if (admin.apps && admin.apps.length > 0) {
      return admin.app();
    }

    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    return admin.app();
  }).catch((error) => {
    firebaseInitPromise = null;
    console.error('Firebase Admin failed to initialize:', error.message);
    return null;
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

module.exports = { initFirebaseAdmin, sendSchoolApprovedNotification };

