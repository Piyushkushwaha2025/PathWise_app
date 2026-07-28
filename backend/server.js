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
const User = require('./models/User');
const Assignment = require('./models/Assignment');
const UserAssignment = require('./models/UserAssignment');
const { Webhook } = require('svix');

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

// ─── CLERK WEBHOOKS (Must be before express.json) ──────────────────────────
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

  // Handle the user.deleted event
  if (evt.type === 'user.deleted') {
    const clerkId = evt.data.id;
    try {
      await User.findOneAndDelete({ clerkUserId: clerkId });
      console.log(`✅ Webhook: Deleted user ${clerkId} from MongoDB`);
    } catch (err) {
      console.error(`❌ Webhook Error deleting user:`, err);
    }
  }

  res.status(200).json({ success: true });
});

// Standard JSON middleware for other routes
app.use(express.json());

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
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
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

// ─── Backblaze B2 (S3-compatible) ────────────────────────────────────────────
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


// ─── Multer (in-memory, max 5MB, PDF/doc only) ──────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and Word documents are allowed'));
  }
});

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const getClerkId = (req, res, next) => {
  const clerkId = req.headers['x-clerk-user-id'] || req.body.clerkUserId;
  if (!clerkId) return res.status(401).json({ error: 'Unauthorized: Missing Clerk User ID' });
  req.clerkUserId = clerkId;
  next();
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

// Admin role management is done directly via MongoDB Atlas — no API routes needed.

// ─── Razorpay ────────────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret',
});

// ════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// 1. Get or Create User Profile (returns role info too)
app.post('/api/user/sync', getClerkId, async (req, res) => {
  try {
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) {
      user = new User({
        clerkUserId: req.clerkUserId,
        email: req.body.email || '',
        uid: req.body.uid || null,
        section_code: req.body.section_code || null,
        app_first_opened_date: new Date(),
      });
      await user.save();
    } else {
      let changed = false;
      if (req.body.email && !user.email) {
        user.email = req.body.email;
        changed = true;
      }
      if (req.body.uid && user.uid !== req.body.uid) {
        user.uid = req.body.uid;
        changed = true;
      }
      if (req.body.section_code && user.section_code !== req.body.section_code) {
        user.section_code = req.body.section_code;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Save Push Token
app.post('/api/user/push-token', getClerkId, async (req, res) => {
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

// 3. Upgrade to Premium
app.post('/api/user/upgrade', getClerkId, async (req, res) => {
  try {
    let user = await User.findOne({ clerkUserId: req.clerkUserId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.is_premium = true;
    await user.save();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CR roles are assigned directly in MongoDB Atlas by the admin (you).
// No API routes needed for CR management.
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// ASSIGNMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get all unique sections that have CRs or assignments
app.get('/api/sections', async (req, res) => {
  try {
    const sections = await User.distinct('section_code', { role: 'cr', section_code: { $ne: null } });
    res.json(sections);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 7. Upload PDF to Cloudflare R2 (CR only)
app.post('/api/assignments/upload-pdf', getClerkId, requireCR, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const filename = `${Date.now()}-${req.file.originalname.replace(/\s/g, '_')}`;
    const key = `assignments/${req.crUser.section_code}/${filename}`;

    await b2.send(new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Store the key (path), not a public URL — signed URLs generated on download
    res.json({ success: true, pdf_key: key, pdf_filename: req.file.originalname });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Create Assignment (CR only)
app.post('/api/assignments', getClerkId, requireCR, async (req, res) => {
  try {
    const { title, subject, description, dueDate, pdf_key, pdf_filename } = req.body;
    if (!title || !subject || !dueDate) return res.status(400).json({ error: 'title, subject, dueDate required' });

    const assignment = new Assignment({
      title,
      subject,
      description: description || '',
      dueDate: new Date(dueDate),
      created_by: req.clerkUserId,
      section_code: req.crUser.section_code,
      pdf_key: pdf_key || null,
      pdf_filename: pdf_filename || null,
    });
    await assignment.save();

    // Send push notifications to all students in this section
    const students = await User.find({
      section_code: req.crUser.section_code,
      role: 'student',
      expoPushToken: { $ne: null }
    });

    const expo = await getExpo();
    const { Expo } = await import('expo-server-sdk');
    const messages = students
      .filter(s => Expo.isExpoPushToken(s.expoPushToken))
      .map(s => ({
        to: s.expoPushToken,
        sound: 'default',
        title: '📋 New Assignment Posted!',
        body: `${title} — Due: ${new Date(dueDate).toLocaleDateString()}`,
        data: { assignmentId: assignment._id.toString() },
      }));

    if (messages.length > 0) {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try { await expo.sendPushNotificationsAsync(chunk); } catch (_) {}
      }
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

// ════════════════════════════════════════════════════════════════════════════
// PAYMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/payment/create-order', getClerkId, async (req, res) => {
  try {
    const options = {
      amount: 299 * 100,
      currency: 'INR',
      receipt: `receipt_${req.clerkUserId}_${Date.now()}`
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
    const signature = req.headers['x-razorpay-signature'];
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(JSON.stringify(req.body)).digest('hex');

    if (expectedSignature === signature) {
      const event = req.body;
      if (event.event === 'payment.captured') {
        const clerkUserId = event.payload.payment.entity.notes.clerkUserId;
        if (clerkUserId) {
          await User.findOneAndUpdate({ clerkUserId }, { is_premium: true });
          console.log(`✅ Upgraded user ${clerkUserId} to Premium!`);
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
app.get('/api/users/count', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel serverless; also listen locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app;
