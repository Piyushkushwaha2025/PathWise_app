require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const SaturdayOverride = mongoose.model('SaturdayOverride', new mongoose.Schema({
  date: { type: String, required: true }, 
  mapped_day: { type: String, required: true },
  section_code: { type: String, required: true },
  created_by: { type: String, required: true }
}));

const User = require('./models/User');
const Assignment = require('./models/Assignment');
const UserAssignment = require('./models/UserAssignment');
const Notification = require('./models/Notification');
const { Webhook } = require('svix');

// â”€â”€â”€ Trial Fingerprint: tracks deleted users to prevent free trial abuse â”€â”€â”€â”€â”€â”€
// Stores SHA-256 hash of email â€” so we don't store raw PII but can still detect
// re-registrations with the same email after account deletion.
const UsedTrialFingerprintSchema = new mongoose.Schema({
  emailHash: { type: String, required: true, unique: true },
  trial_started_at: { type: Date, required: true },
  deleted_at: { type: Date, default: Date.now },
});
const UsedTrialFingerprint = mongoose.model('UsedTrialFingerprint', UsedTrialFingerprintSchema);

// expo-server-sdk is ESM-only; use dynamic import lazily
let _expo = null;
async function getExpo() {
  if (!_expo) {
    const { Expo } = await import('expo-server-sdk');
    _expo = new Expo();
  }
  return _expo;
}
const app = express();
app.use(cors());

// â”€â”€â”€ CLERK WEBHOOKS (Must be before express.json) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return res.status(500).json({ error: 'Please add CLERK_WEBHOOK_SECRET to .env' });

  const svix_id = req.headers['svix-id'];
  const svix_timestamp = req.headers['svix-timestamp'];
  const svix_signature = req.headers['svix-signature'];
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: 'Error occurred -- no svix headers' });
  }

  const payload = req.body;
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    return res.status(400).json({ error: 'Error verifying webhook' });
  }

  // â”€â”€â”€ user.created: Auto-create user record in MongoDB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (evt.type === 'user.created') {
    const clerkId = evt.data.id;
    const rawEmail = (evt.data.email_addresses?.[0]?.email_address || '').toLowerCase().trim();
    try {
      const exists = await User.findOne({ clerkUserId: clerkId });
      if (!exists) {
        let restoredTrialAt = null;

        // â”€â”€ Trial Abuse Prevention â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // If this email was used before and account was deleted, restore old trial
        // start date so they don't get a fresh 30-day trial on re-registration.
        if (rawEmail) {
          const emailHash = crypto.createHash('sha256').update(rawEmail).digest('hex');
          const fingerprint = await UsedTrialFingerprint.findOne({ emailHash });
          if (fingerprint) {
            restoredTrialAt = fingerprint.trial_started_at;
            console.log(`âš ï¸ Webhook: Email re-registration detected. Restoring trial_started_at for ${clerkId}`);
          }
        }

        const fullName = `${evt.data.first_name || ''} ${evt.data.last_name || ''}`.trim() || null;
        await User.create({
          clerkUserId: clerkId,
          name: fullName,
          trial_started_at: restoredTrialAt || new Date(),
        });
        console.log(`âœ… Webhook: Created user ${clerkId} in MongoDB`);
      }
    } catch (err) {
      console.error(`âŒ Webhook Error creating user:`, err);
    }
  }

  // â”€â”€â”€ user.deleted: CASCADE delete ALL data for that user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (evt.type === 'user.deleted') {
    const clerkId = evt.data.id;
    const rawEmail = (evt.data.email_addresses?.[0]?.email_address || '').toLowerCase().trim();
    try {
      await connectDB();

      // 1. Delete User profile (save trial info first for abuse prevention)
      const deletedUser = await User.findOneAndDelete({ clerkUserId: clerkId });

      // 1b. Save email fingerprint so re-registration can't get a fresh trial
      if (deletedUser && rawEmail && deletedUser.trial_started_at) {
        try {
          const emailHash = crypto.createHash('sha256').update(rawEmail).digest('hex');
          await UsedTrialFingerprint.findOneAndUpdate(
            { emailHash },
            { emailHash, trial_started_at: deletedUser.trial_started_at, deleted_at: new Date() },
            { upsert: true, new: true }
          );
          console.log(`ðŸ”’ Webhook: Saved trial fingerprint for deleted user ${clerkId}`);
        } catch (fpErr) {
          console.warn(`âš ï¸ Could not save trial fingerprint:`, fpErr.message);
        }
      }

      // 2. Delete all UserAssignment tracking records for this user
      const userAssignmentsResult = await UserAssignment.deleteMany({ clerkUserId: clerkId });

      // 3. If the user was a CR, delete all Assignments they created
      //    and also clean up associated B2 PDFs if any
      const createdAssignments = await Assignment.find({ created_by: clerkId });
      let deletedPdfs = 0;
      for (const assignment of createdAssignments) {
        if (assignment.pdf_key) {
          try {
            await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: assignment.pdf_key }));
            deletedPdfs++;
          } catch (s3err) {
            console.warn(`âš ï¸ Could not delete B2 PDF ${assignment.pdf_key}:`, s3err.message);
          }
        }
      }
      const assignmentsResult = await Assignment.deleteMany({ created_by: clerkId });
      const notificationsResult = await Notification.deleteMany({ created_by: clerkId });
      
      console.log(`[Webhook] Cleanup complete for user ${clerkId}:\n` + 
        `     User doc deleted\n` +
        `     UserAssignment records: ${userAssignmentsResult.deletedCount} deleted\n` +
        `     Assignments created by user: ${assignmentsResult.deletedCount} deleted\n` +
        `     Notifications created by user: ${notificationsResult.deletedCount} deleted\n` +
        `     PDFs checked: ${createdAssignments.length}`);
    } catch (err) {
      console.error(`âŒ Webhook CASCADE DELETE Error for ${clerkId}:`, err);
    }
  }

  res.status(200).json({ success: true });
});

// Standard JSON middleware with rawBody preservation for webhooks
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/studyos';

let isConnected = false;
const connectDB = async () => {
  if (isConnected) {
    return;
  }
  try {
    const db = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('âœ… Connected to MongoDB');
  } catch (error) {
    console.error('âŒ MongoDB Connection Error:', error);
    throw error;
  }
};

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// â”€â”€â”€ Backblaze B2 (S3-compatible) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const B2_ENDPOINT = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
const B2_REGION = B2_ENDPOINT.replace('https://s3.', '').replace('.backblazeb2.com', ''); // "us-east-005"

const b2 = new S3Client({
  region: B2_REGION,
  endpoint: B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
  },
});
const B2_BUCKET = process.env.B2_BUCKET_NAME || 'studyos-assignments';

// Helper: generate a 1-hour signed download URL
async function getDownloadUrl(key) {
  try {
    const command = new GetObjectCommand({ Bucket: B2_BUCKET, Key: key });
    return await getSignedUrl(b2, command, { expiresIn: 3600 });
  } catch {
    return null;
  }
}


const path = require('path');

function getMimeType(filename, defaultMime = 'application/pdf') {
  const ext = path.extname(filename || '').toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  return map[ext] || (defaultMime === 'application/octet-stream' ? 'application/pdf' : defaultMime);
}

// â”€â”€â”€ Multer (in-memory, up to 15MB, all college documents & images allowed) â”€â”€â”€â”€
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    // Accept all college study documents and images
    cb(null, true);
  }
});

const { verifyToken } = require('@clerk/backend');

const getClerkId = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : req.headers['x-clerk-token'];
  
  if (token) {
    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (!secretKey) throw new Error('CLERK_SECRET_KEY is missing in env');
      
      // Verify the Clerk JWT cryptographically
      const verified = await verifyToken(token, { secretKey });
      if (verified && verified.sub) {
        req.clerkUserId = verified.sub; // Authenticated User ID
        return next();
      }
    } catch (error) {
      console.warn("JWT Verification failed:", error.message);
      const reqPath = req.path || '';
      if (reqPath.startsWith('/api/payment') || reqPath.startsWith('/api/rewards/redeem') || (reqPath === '/api/user' && req.method === 'DELETE')) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    }
  }

  // Sensitive payment & token-to-pro redemption paths strictly require a verified JWT
  const path = req.path || '';
  const isStrictPath = 
    path.startsWith('/api/payment') ||
    path.startsWith('/api/rewards/redeem') ||
    (path === '/api/user' && req.method === 'DELETE');

  if (isStrictPath) {
    return res.status(401).json({ error: 'Unauthorized: Verified JWT token required for this action' });
  }

  // Fallback for daily bonus, ad watching, rewards status, user sync, assignments and notifications
  const fallbackId = req.headers['x-clerk-user-id'] || req.body?.clerkUserId;
  if (fallbackId) {
    req.clerkUserId = fallbackId;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Missing authentication credentials' });
};

const requireCR = async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user || !['cr', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: CR or Admin role required' });
    }
    req.crUser = user;
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// Admin role management is done directly via MongoDB Atlas â€” no API routes needed.

// â”€â”€â”€ Razorpay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret',
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// USER ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// 1. Get or Create User Profile (returns role info too)
app.post('/api/user/sync', getClerkId, async (req, res) => {
  try {
    const rawUid = req.body.uid;
    const incomingUid = (rawUid && String(rawUid).trim() !== '' && String(rawUid).trim().toUpperCase() !== 'UNKNOWN')
      ? String(rawUid).trim().toUpperCase()
      : null;

    let user = await User.findOne({ clerkUserId: req.clerkUserId });

    if (user) {
      const currentBoundUid = (user.uid && user.uid.trim() !== '' && user.uid.trim().toUpperCase() !== 'UNKNOWN')
        ? user.uid.trim().toUpperCase()
        : null;

      // Handle UID binding / updating
      if (incomingUid) {
        if (!currentBoundUid || incomingUid !== currentBoundUid) {
          const existingWithUID = await User.findOne({
            uid: { $regex: new RegExp(`^${incomingUid}$`, 'i') },
            clerkUserId: { $ne: req.clerkUserId }
          });
          if (existingWithUID) {
            return res.status(409).json({
              error: 'UID_ALREADY_LINKED',
              message: 'This college ID is already linked to another PathWise account.'
            });
          }
          user.uid = incomingUid;
        }
      }
    } else {
      // Brand new user account
      if (incomingUid) {
        const existingWithUID = await User.findOne({
          uid: { $regex: new RegExp(`^${incomingUid}$`, 'i') }
        });
        if (existingWithUID) {
          return res.status(409).json({
            error: 'UID_ALREADY_LINKED',
            message: 'This college ID is already linked to another PathWise account.'
          });
        }
      }

      const incomingSection = req.body.section_code ? String(req.body.section_code).trim().toUpperCase() : null;
      // Only reject course codes (which have 3 or 4 digits like 25CSH-214, 25CST-208, 25UCT-201)
      const isCourseCode = incomingSection && /^[0-9A-Z]{2,6}-\d{3,4}[A-Z]?$/i.test(incomingSection);
      const validSection = (!isCourseCode && incomingSection) ? incomingSection : null;

      user = new User({
        clerkUserId: req.clerkUserId,
        uid: incomingUid,
        name: req.body.name || null,
        section_code: validSection || null,
        semester: req.body.semester ? String(req.body.semester) : null,
        expoPushToken: req.body.expoPushToken || null,
        trial_started_at: new Date(),
      });
      await user.save();
      return res.json(user);
    }

    let changed = false;
    if (incomingUid && user.uid !== incomingUid) {
      user.uid = incomingUid;
      changed = true;
    }
    if (req.body.name && user.name !== req.body.name) {
      user.name = req.body.name;
      changed = true;
    }

    const incomingSection = req.body.section_code ? String(req.body.section_code).trim().toUpperCase() : null;
    const isCourseCode = incomingSection && /^[0-9A-Z]{2,6}-\d{3,4}[A-Z]?$/i.test(incomingSection);
    const validSection = (!isCourseCode && incomingSection) ? incomingSection : null;

    if (validSection && user.section_code !== validSection) {
      user.section_code = validSection;
      changed = true;
    } else if (user.section_code && /^[0-9A-Z]{2,6}-\d{3,4}[A-Z]?$/i.test(user.section_code)) {
      user.section_code = validSection;
      changed = true;
    }

    if (req.body.semester && user.semester !== String(req.body.semester)) {
      user.semester = String(req.body.semester);
      changed = true;
    }
    if (req.body.expoPushToken && user.expoPushToken !== req.body.expoPushToken) {
      user.expoPushToken = req.body.expoPushToken;
      changed = true;
    }
    if (!user.trial_started_at) {
      user.trial_started_at = user.createdAt || new Date();
      changed = true;
    }
    if (changed || user.isModified()) {
      await user.save();
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pre-verification route for StudyOS login
app.post('/api/user/verify-uid', getClerkId, async (req, res) => {
  try {
    const rawUid = req.body.uid;
    if (!rawUid || !String(rawUid).trim()) {
      return res.status(400).json({ error: 'UID is required' });
    }
    const incomingUid = String(rawUid).trim().toUpperCase();

    const user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (user && user.uid && user.uid.trim() !== '' && user.uid.trim().toUpperCase() !== 'UNKNOWN') {
      const boundUid = user.uid.trim().toUpperCase();
      const isDummy = boundUid.includes('TEST') || boundUid.startsWith('TEMP');
      if (incomingUid !== boundUid && !isDummy) {
        const existingWithUID = await User.findOne({
          uid: { $regex: new RegExp(`^${incomingUid}$`, 'i') },
          clerkUserId: { $ne: req.clerkUserId }
        });
        if (existingWithUID) {
          return res.status(409).json({
            allowed: false,
            error: 'UID_ALREADY_LINKED',
            message: 'This college ID is already linked to another PathWise account.'
          });
        }
      }
      return res.json({ allowed: true, boundUid: incomingUid });
    }

    const existingWithUID = await User.findOne({
      uid: { $regex: new RegExp(`^${incomingUid}$`, 'i') },
      clerkUserId: { $ne: req.clerkUserId }
    });
    if (existingWithUID) {
      return res.status(409).json({
        allowed: false,
        error: 'UID_ALREADY_LINKED',
        message: 'This college ID is already linked to another PathWise account.'
      });
    }

    return res.json({ allowed: true, boundUid: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Save Push Token
app.post(['/api/user/push-token', '/user/push-token'], getClerkId, async (req, res) => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken) return res.status(400).json({ error: 'Missing token' });
    
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (user) {
      user.expoPushToken = expoPushToken;
      await user.save();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Set Free AI Subject
app.post('/api/user/set-free-subject', getClerkId, async (req, res) => {
  try {
    const { subjectId } = req.body;
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.free_ai_subject_id) {
      return res.status(400).json({ error: 'Free subject already selected', currentSubject: user.free_ai_subject_id });
    }
    user.free_ai_subject_id = subjectId;
    await user.save();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update or Cancel Subscription Status in DB
app.post('/api/user/subscription', getClerkId, async (req, res) => {
  try {
    const { is_premium } = req.body;
    // Security: Directly setting is_premium=true via this endpoint is disallowed.
    // Premium status must only be granted via /api/payment/verify, /api/payment/webhook, or /api/rewards/redeem.
    if (is_premium === true) {
      return res.status(403).json({ error: 'Direct upgrade not permitted. Use official payment verification.' });
    }

    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.is_premium = false;
    user.subscription_plan = 'free';
    await user.save();

    console.log(`âœ… Subscription cancelled/set to free in DB for ${req.clerkUserId}`);
    res.json({ success: true, user });
  } catch (error) {
    console.error('âŒ Error updating subscription in DB:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Direct Account Deletion Route (DPDP 2023 Erasure & In-App Deletion)
app.delete(['/api/user', '/user'], getClerkId, async (req, res) => {
  try {
    const clerkId = req.clerkUserId;
    await connectDB();

    // 1. Delete User profile
    await User.findOneAndDelete({ clerkUserId: clerkId });

    // 2. Delete all UserAssignment tracking records
    await UserAssignment.deleteMany({ clerkUserId: clerkId });

    // 3. If CR, clean up created assignments & B2 PDFs
    const createdAssignments = await Assignment.find({ created_by: clerkId });
    for (const assignment of createdAssignments) {
      if (assignment.pdf_key) {
        try {
          await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: assignment.pdf_key }));
        } catch (s3err) {
          console.warn(`âš ï¸ Could not delete B2 PDF ${assignment.pdf_key}:`, s3err.message);
        }
      }
    }
    await Assignment.deleteMany({ created_by: clerkId });
    await Notification.deleteMany({ created_by: clerkId });

    console.log(`âœ… Permanently deleted user and cascaded records for ${clerkId}`);
    res.json({ success: true, message: 'User account and associated data successfully deleted' });
  } catch (error) {
    console.error('âŒ Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CR roles are assigned directly in MongoDB Atlas by the admin (you).
// No API routes needed for CR management.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ASSIGNMENT ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Get all unique sections that have CRs or assignments
app.get('/api/sections', getClerkId, async (req, res) => {
  try {
    const sections = await User.distinct('section_code', { role: 'cr', section_code: { $ne: null } });
    res.json(sections);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 7a. Get Presigned Upload URL for Backblaze B2 (CR only - bypasses serverless payload limits)
app.post(['/api/assignments/get-upload-url', '/api/get-upload-url'], getClerkId, requireCR, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });

    const safeOriginalName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${Date.now()}-${safeOriginalName}`;
    const sectionFolder = (req.crUser && req.crUser.section_code) ? req.crUser.section_code : 'general';
    const key = `assignments/${sectionFolder}/${uniqueFilename}`;
    const determinedContentType = getMimeType(filename, contentType);

    const command = new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      ContentType: determinedContentType,
    });

    const uploadUrl = await getSignedUrl(b2, command, { expiresIn: 900 });

    res.json({
      uploadUrl,
      key,
      filename: safeOriginalName,
      contentType: determinedContentType,
    });
  } catch (e) {
    console.error('Error generating presigned upload URL:', e);
    res.status(500).json({ error: e.message || 'Failed to generate upload URL' });
  }
});

// 7. Upload PDF / Document to Backblaze B2 (CR only)
app.post(['/api/assignments/upload-pdf', '/api/upload-document'], getClerkId, requireCR, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'No file provided' });

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${Date.now()}-${safeOriginalName}`;
      const sectionFolder = (req.crUser && req.crUser.section_code) ? req.crUser.section_code : 'general';
      const key = `assignments/${sectionFolder}/${filename}`;
      const determinedContentType = getMimeType(req.file.originalname, req.file.mimetype);

      await b2.send(new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: determinedContentType,
      }));

      // Store the key (path), not a public URL â€” signed URLs generated on download
      res.json({ success: true, pdf_key: key, pdf_filename: req.file.originalname || safeOriginalName });
    } catch (e) {
      console.error('B2 upload error:', e);
      res.status(500).json({ error: e.message || 'Failed to upload document to storage' });
    }
  });
});

// 8. Create Assignment (CR only)
app.post('/api/assignments', getClerkId, requireCR, async (req, res) => {
  try {
    const { title, subject, description, dueDate, pdf_key, pdf_filename, section_code } = req.body;
    if (!title || !subject || !dueDate) return res.status(400).json({ error: 'title, subject, dueDate required' });

    const finalSection = section_code || req.crUser.section_code;
    if (!finalSection) {
      return res.status(400).json({ error: 'Section code is missing. Please sync your profile.' });
    }
    if (!req.crUser.section_code || req.crUser.section_code !== finalSection) {
      req.crUser.section_code = finalSection;
      await req.crUser.save().catch(() => {});
    }

    const dueDateObj = new Date(dueDate);
    const expiresAt = new Date(dueDateObj);
    expiresAt.setDate(expiresAt.getDate() + 2); // Auto-delete 2 days after due date

    const assignment = new Assignment({
      title,
      subject,
      description: description || '',
      dueDate: dueDateObj,
      created_by: req.clerkUserId,
      section_code: finalSection,
      pdf_key: pdf_key || null,
      pdf_filename: pdf_filename || null,
      expiresAt: expiresAt,
    });
    await assignment.save();

    // Send push notifications to all students in this section (excluding creator)
    try {
      const students = await User.find({
        section_code: finalSection,
        clerkUserId: { $ne: req.clerkUserId },
        expoPushToken: { $ne: null }
      });

      const expo = await getExpo();
      const { Expo } = await import('expo-server-sdk');
      const messages = students
        .filter(s => s.expoPushToken && Expo.isExpoPushToken(s.expoPushToken))
        .map(s => ({
          to: s.expoPushToken,
          sound: 'ting.mp3',
          channelId: 'pathwise-default-v2',
          title: 'ðŸ“‹ New Assignment Posted!',
          body: `${title} (${subject}) â€” Due: ${new Date(dueDate).toLocaleDateString()}`,
          data: { assignmentId: assignment._id.toString(), type: 'assignment' },
          priority: 'high',
        }));

      if (messages.length > 0) {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
          try { await expo.sendPushNotificationsAsync(chunk); } catch (_) {}
        }
      }
    } catch (pushErr) {
      console.error('Error dispatching assignment pushes:', pushErr);
    }

    res.json({ success: true, assignment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 9. Get Assignments for a section
app.get('/api/assignments', getClerkId, async (req, res) => {
  try {
    let targetSection = req.query.section;
    const user = await User.findOne({ clerkUserId: req.clerkUserId });
    
    // If no section provided in query, fallback to user's saved section (if any)
    if (!targetSection) {
      if (user && user.section_code) {
        targetSection = user.section_code;
      } else {
        return res.json([]); // No section to fetch for
      }
    }

    const assignments = await Assignment.find({ section_code: targetSection })
      .sort({ dueDate: 1 });

    // Fetch completion status for this user
    const userAssignments = await UserAssignment.find({ clerkUserId: req.clerkUserId });
    const completedMap = {};
    userAssignments.forEach(ua => { completedMap[ua.assignmentId.toString()] = ua.status; });

    // Generate signed download URLs for PDFs
    const result = await Promise.all(assignments.map(async a => {
      const obj = a.toObject();
      return {
        ...obj,
        status: completedMap[a._id.toString()] || 'pending',
        pdf_download_url: obj.pdf_key ? await getDownloadUrl(obj.pdf_key) : null,
      };
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 10. Mark assignment as done/pending
app.post('/api/assignments/:id/toggle', getClerkId, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await UserAssignment.findOne({ clerkUserId: req.clerkUserId, assignmentId: id });

    if (!existing) {
      await UserAssignment.create({ clerkUserId: req.clerkUserId, assignmentId: id, status: 'submitted', submittedAt: new Date() });
      return res.json({ status: 'submitted' });
    }

    const newStatus = existing.status === 'submitted' ? 'pending' : 'submitted';
    existing.status = newStatus;
    existing.submittedAt = newStatus === 'submitted' ? new Date() : null;
    await existing.save();
    res.json({ status: newStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 11. Delete Assignment (CR who created it or admin)
app.delete('/api/assignments/:id', getClerkId, async (req, res) => {
  try {
    const user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user || !['cr', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' });

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Not found' });

    // Only the creator or admin can delete
    if (assignment.created_by !== req.clerkUserId && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own assignments' });
    }

    // Delete PDF from B2 if exists
    if (assignment.pdf_key) {
      try { await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: assignment.pdf_key })); } catch (_) {}
    }

    await assignment.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NOTIFICATION ROUTES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Get notifications for a section
app.get('/api/notifications', getClerkId, async (req, res) => {
  try {
    let targetSection = req.query.section;
    if (!targetSection) {
      const user = await User.findOne({ clerkUserId: req.clerkUserId });
      if (user) targetSection = user.section_code;
    }
    if (!targetSection) return res.json([]);

    const notifications = await Notification.find({ section_code: targetSection })
      .sort({ createdAt: -1 })
      .lean();

    const withSignedUrls = await Promise.all(
      notifications.map(async (n) => ({
        ...n,
        pdf_download_url: n.pdf_key ? await getDownloadUrl(n.pdf_key) : null,
      }))
    );

    res.json(withSignedUrls);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a new notification (CR only)
app.post('/api/notifications', getClerkId, requireCR, async (req, res) => {
  try {
    const { title, message, expiresAt, section_code, pdf_key, pdf_filename } = req.body;
    if (!title || !message || !expiresAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const finalSection = section_code || req.crUser.section_code;
    if (!finalSection) {
      return res.status(400).json({ error: 'Section code is missing. Please sync your profile.' });
    }
    if (!req.crUser.section_code || req.crUser.section_code !== finalSection) {
      req.crUser.section_code = finalSection;
      await req.crUser.save().catch(() => {});
    }

    const notification = new Notification({
      title,
      message,
      created_by: req.clerkUserId,
      section_code: finalSection,
      expiresAt: new Date(expiresAt),
      pdf_key: pdf_key || null,
      pdf_filename: pdf_filename || null,
    });

    await notification.save();

    // Send instant push notifications to all students in this section (excluding creator)
    try {
      const students = await User.find({
        section_code: finalSection,
        clerkUserId: { $ne: req.clerkUserId },
        expoPushToken: { $ne: null }
      });

      const expo = await getExpo();
      const { Expo } = await import('expo-server-sdk');
      const pushMessages = students
        .filter(s => s.expoPushToken && Expo.isExpoPushToken(s.expoPushToken))
        .map(s => ({
          to: s.expoPushToken,
          sound: 'default',
          channelId: 'pathwise-default-v2',
          title: `ðŸ“¢ CR Announcement: ${title}`,
          body: message.length > 120 ? `${message.substring(0, 117)}...` : message,
          data: { notificationId: notification._id.toString(), type: 'cr_notification' },
          priority: 'high',
        }));

      if (pushMessages.length > 0) {
        const chunks = expo.chunkPushNotifications(pushMessages);
        for (const chunk of chunks) {
          try { await expo.sendPushNotificationsAsync(chunk); } catch (err) {
            console.error('Error sending CR notification push chunk:', err);
          }
        }
      }
    } catch (pushErr) {
      console.error('Error dispatching CR announcement pushes:', pushErr);
    }

    const responseNotif = notification.toObject();
    if (responseNotif.pdf_key) {
      responseNotif.pdf_download_url = await getDownloadUrl(responseNotif.pdf_key);
    }

    res.json(responseNotif);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a notification
app.delete('/api/notifications/:id', getClerkId, async (req, res) => {
  try {
    const user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user || !['cr', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' });

    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Not found' });

    if (notification.created_by !== req.clerkUserId && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own notifications' });
    }

    // Delete PDF from B2 if attached
    if (notification.pdf_key) {
      try { await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: notification.pdf_key })); } catch (_) {}
    }

    await notification.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SATURDAY OVERRIDE ROUTES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/saturday-override', getClerkId, async (req, res) => {
  try {
    const { section_code } = req.query;
    if (!section_code) return res.status(400).json({ error: 'Missing section' });
    const todayStr = new Date().toISOString().split('T')[0];
    const overrides = await SaturdayOverride.find({ 
      section_code,
      date: { $gte: todayStr }
    });
    res.json(overrides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saturday-override', getClerkId, requireCR, async (req, res) => {
  try {
    const { date, mapped_day, section_code } = req.body;
    if (!date || !mapped_day) return res.status(400).json({ error: 'Missing fields' });
    const finalSection = section_code || req.crUser.section_code;
    if (!finalSection) return res.status(400).json({ error: 'Section missing' });
    
    const override = await SaturdayOverride.findOneAndUpdate(
      { date, section_code: finalSection },
      { mapped_day, created_by: req.clerkUserId },
      { upsert: true, new: true }
    );
    res.json(override);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saturday-override/:id', getClerkId, requireCR, async (req, res) => {
  try {
    const override = await SaturdayOverride.findById(req.params.id);
    if (!override) return res.status(404).json({ error: 'Not found' });
    if (override.created_by !== req.clerkUserId && req.crUser.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own overrides' });
    }
    await override.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PAYMENT ROUTES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/api/payment/create-order', getClerkId, async (req, res) => {
  try {
    const { plan_id, receipt } = req.body;

    // â”€â”€ Server-side price validation (never trust client amount) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const PLAN_PRICES = {
      monthly:  5900,   // â‚¹59
      semester: 29900,  // â‚¹299
      yearly:   49900,  // â‚¹499
    };
    const amount = PLAN_PRICES[plan_id];
    if (!amount) {
      return res.status(400).json({ error: 'Invalid plan_id. Must be one of: monthly, semester, yearly' });
    }

    const options = {
      amount,
      currency: 'INR',
      receipt: receipt || `receipt_${req.clerkUserId}_${Date.now()}`,
      notes: { clerkUserId: req.clerkUserId, plan_id } // stored for webhook use
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment/verify', getClerkId, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, duration_days } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET; // Must use env var

    if (!secret) return res.status(500).json({ error: 'Server misconfiguration' });

    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is legit! Determine plan duration server-side for security
      const PLAN_DURATIONS = {
        'monthly': 30,
        'semester': 180,
        'yearly': 365,
      };
      const validDurationDays = PLAN_DURATIONS[plan_id] || (typeof duration_days === 'number' && duration_days > 0 && duration_days <= 365 ? duration_days : 30);
      
      const existingUser = await User.findOne({ clerkUserId: req.clerkUserId });
      const now = Date.now();
      const currentExpiry = existingUser?.premium_expires_at && existingUser.premium_expires_at > now
        ? existingUser.premium_expires_at
        : now;
      const expiryTime = currentExpiry + (validDurationDays * 24 * 60 * 60 * 1000);

      await User.findOneAndUpdate(
        { clerkUserId: req.clerkUserId }, 
        { 
          is_premium: true,
          subscription_plan: plan_id || 'pro',
          premium_expires_at: expiryTime
        },
        { upsert: true }
      );
      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ error: 'Invalid Signature' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

    const signature = req.headers['x-razorpay-signature'];
    // Use pristine raw buffer captured before JSON parsing for byte-for-byte HMAC verification
    const rawPayload = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8'));
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(rawPayload).digest('hex');

    if (expectedSignature === signature) {
      const event = JSON.parse(rawPayload.toString('utf8'));
      if (event.event === 'payment.captured') {
        const payment = event.payload?.payment?.entity;
        const clerkUserId = payment?.notes?.clerkUserId;
        const plan_id = payment?.notes?.plan_id;

        if (clerkUserId) {
          const PLAN_DURATIONS = { monthly: 30, semester: 180, yearly: 365 };
          const durationDays = PLAN_DURATIONS[plan_id] || 30;
          const expiryTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);

          await User.findOneAndUpdate(
            { clerkUserId },
            {
              is_premium: true,
              subscription_plan: plan_id || 'pro',
              premium_expires_at: expiryTime  // â† Now sets expiry correctly
            }
          );
          console.log(`âœ… Upgraded user ${clerkUserId} to ${plan_id || 'pro'} via Webhook! Expires: ${new Date(expiryTime).toISOString()}`);
        }
      }
      res.json({ status: 'ok' });
    } else {
      res.status(400).json({ error: 'Invalid Signature' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get total user count
// Get total user count (authenticated only)
app.get('/api/users/count', getClerkId, async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REWARDS & ADS ====================

// In-memory sliding rate limiter per user/IP
const rateLimitStore = new Map();
const createRateLimiter = (maxRequests, windowMs, errorMessage) => (req, res, next) => {
  const identifier = req.clerkUserId || req.ip || 'anonymous';
  const now = Date.now();
  const userRecord = rateLimitStore.get(identifier) || { count: 0, resetAt: now + windowMs };

  if (now > userRecord.resetAt) {
    userRecord.count = 0;
    userRecord.resetAt = now + windowMs;
  }

  userRecord.count += 1;
  rateLimitStore.set(identifier, userRecord);

  if (userRecord.count > maxRequests) {
    return res.status(429).json({ 
      error: 'RATE_LIMIT_EXCEEDED', 
      message: errorMessage || 'Too many requests. Please try again later.' 
    });
  }
  next();
};

const rewardRateLimiter = createRateLimiter(10, 60 * 1000, 'Too many reward claims. Please wait a moment.');

const MAX_ADS_PER_DAY = 5;
const REDEMPTION_PLANS = {
  one_day:   { tokens: 50,  days: 1  },
  one_week:  { tokens: 200, days: 7  },
  two_weeks: { tokens: 350, days: 14 },
  one_month: { tokens: 500, days: 30 },
};

// GET /api/rewards/status - get current token balance & premium status
app.get('/api/rewards/status', getClerkId, async (req, res) => {
  try {
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) {
      user = new User({
        clerkUserId: req.clerkUserId,
        trial_started_at: new Date(),
      });
      await user.save();
    }

    const today = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
    if (user.last_ad_watch_date !== today) {
      user.ads_watched_today = 0;
      user.daily_ad_views = 0;
      user.last_ad_watch_date = today;
      await user.save();
    }

    const isPremiumActive = Boolean(user.premium_expires_at && user.premium_expires_at > Date.now());
    const isPaidActive = Boolean(user.is_premium && user.subscription_plan && user.subscription_plan !== 'free' && user.subscription_plan !== 'reward' && isPremiumActive);

    res.json({
      token_balance: user.token_balance || 0,
      daily_claimed_today: user.last_daily_bonus_date === today,
      last_daily_bonus_date: user.last_daily_bonus_date || null,
      ads_watched_today: user.ads_watched_today || 0,
      ads_remaining_today: Math.max(0, MAX_ADS_PER_DAY - (user.ads_watched_today || 0)),
      max_ads_per_day: MAX_ADS_PER_DAY,
      tokens_per_ad: 10,
      premium_expires_at: user.premium_expires_at || null,
      is_premium: Boolean(user.is_premium && isPremiumActive),
      subscription_plan: user.subscription_plan || 'free',
      is_paid_active: isPaidActive,
      is_reward_premium_active: Boolean(isPremiumActive && user.subscription_plan === 'reward'),
      trial_started_at: user.trial_started_at || user.createdAt || null,
      plans: REDEMPTION_PLANS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/rewards/daily-bonus
app.post('/api/rewards/daily-bonus', getClerkId, rewardRateLimiter, async (req, res) => {
  try {
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) {
      user = new User({
        clerkUserId: req.clerkUserId,
        trial_started_at: new Date(),
      });
      await user.save();
    }

    const today = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

    if (user.last_daily_bonus_date === today) {
      return res.status(400).json({ error: 'ALREADY_CLAIMED', message: 'Daily bonus already claimed today.' });
    }

    user.token_balance = Math.min((user.token_balance || 0) + 10, 9999);
    user.last_daily_bonus_date = today;
    await user.save();

    res.json({
      success: true,
      tokens_earned: 10,
      token_balance: user.token_balance,
      ads_watched_today: user.ads_watched_today || 0,
      ads_remaining_today: Math.max(0, MAX_ADS_PER_DAY - (user.ads_watched_today || 0)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/rewards/watch-ad - Dynamic tokens based on ad_type (10sec=5, 30sec=10, 60sec=20)
app.post('/api/rewards/watch-ad', getClerkId, rewardRateLimiter, async (req, res) => {
  try {
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) {
      user = new User({
        clerkUserId: req.clerkUserId,
        trial_started_at: new Date(),
      });
      await user.save();
    }

    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]; // Indian Standard Time (IST)

    if (user.last_ad_watch_date !== today) {
      user.ads_watched_today = 0;
      user.daily_ad_views = 0;
      user.last_ad_watch_date = today;
    }

    if (user.ads_watched_today >= MAX_ADS_PER_DAY) {
      return res.status(400).json({ error: 'DAILY_LIMIT_REACHED', message: 'Daily ad limit reached' });
    }

    const adType = req.body.ad_type;
    let tokensToCredit = 5; // default 10sec
    let minSecondsRequired = 8;
    if (adType === '30sec') {
      tokensToCredit = 10;
      minSecondsRequired = 24;
    } else if (adType === '60sec') {
      tokensToCredit = 20;
      minSecondsRequired = 48;
    }

    // Anti-cheat: Throttling check against last watch time
    if (user.last_ad_watch_time) {
      const elapsedSeconds = (Date.now() - new Date(user.last_ad_watch_time).getTime()) / 1000;
      if (elapsedSeconds < minSecondsRequired) {
        return res.status(429).json({ 
          error: 'AD_CLAIM_TOO_FAST', 
          message: `Please watch the entire ad before claiming rewards. Please wait ${Math.ceil(minSecondsRequired - elapsedSeconds)}s.` 
        });
      }
    }

    user.token_balance = Math.min((user.token_balance || 0) + tokensToCredit, 9999);
    user.ads_watched_today += 1;
    user.daily_ad_views = user.ads_watched_today;
    user.last_ad_watch_time = new Date();

    await user.save();
    res.json({
      success: true,
      tokens_earned: tokensToCredit,
      token_balance: user.token_balance,
      ads_watched_today: user.ads_watched_today,
      ads_remaining_today: Math.max(0, MAX_ADS_PER_DAY - user.ads_watched_today)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rewards/redeem
app.post('/api/rewards/redeem', getClerkId, rewardRateLimiter, async (req, res) => {
  try {
    const { plan_key } = req.body;
    const plan = REDEMPTION_PLANS[plan_key];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) {
      user = new User({
        clerkUserId: req.clerkUserId,
        trial_started_at: new Date(),
      });
      await user.save();
    }

    if ((user.token_balance || 0) < plan.tokens) {
      return res.status(400).json({ error: 'NOT_ENOUGH_TOKENS' });
    }

    user.token_balance -= plan.tokens;
    const now = Date.now();
    const currentExpiry = user.premium_expires_at || now;
    const startFrom = currentExpiry > now ? currentExpiry : now;
    user.premium_expires_at = startFrom + plan.days * 24 * 60 * 60 * 1000;
    user.is_premium = true;
    if (!user.subscription_plan || user.subscription_plan === 'free') {
      user.subscription_plan = 'reward';
    }
    
    await user.save();

    res.json({
      success: true,
      tokens_spent: plan.tokens,
      days_added: plan.days,
      token_balance: user.token_balance,
      premium_expires_at: user.premium_expires_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export for Vercel serverless; also listen locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`dYs? Server running on port ${PORT}`);
  });
}

module.exports = app;

