require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const User = require('./models/User');
const Assignment = require('./models/Assignment');
const UserAssignment = require('./models/UserAssignment');
const { Expo } = require('expo-server-sdk');

let expo = new Expo();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/studyos';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Middleware to simulate Clerk Auth Verification (In production, use @clerk/express)
// For now, the app just sends the clerkUserId in the body/headers
const getClerkId = (req, res, next) => {
   const clerkId = req.headers['x-clerk-user-id'] || req.body.clerkUserId;
   if (!clerkId) {
      return res.status(401).json({ error: 'Unauthorized: Missing Clerk User ID' });
   }
   req.clerkUserId = clerkId;
   next();
};

// Razorpay Instance
// These should be in your .env file
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret',
});

// 1. Get or Create User Profile
app.post('/api/user/sync', getClerkId, async (req, res) => {
   try {
      let user = await User.findOne({ clerkUserId: req.clerkUserId });
      
      if (!user) {
         user = new User({
            clerkUserId: req.clerkUserId,
            email: req.body.email || '',
            app_first_opened_date: new Date(),
         });
         await user.save();
      }
      
      res.json(user);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// 2. Set Free AI Subject (Only works if not already set)
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

// 3. (Mock fallback) Upgrade to Premium
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

// 4. Create Razorpay Order
app.post('/api/payment/create-order', getClerkId, async (req, res) => {
   try {
       const options = {
           amount: 299 * 100, // Amount in paise (299 INR)
           currency: "INR",
           receipt: `receipt_${req.clerkUserId}_${Date.now()}`
       };
       
       const order = await razorpay.orders.create(options);
       res.json(order);
   } catch (error) {
       res.status(500).json({ error: error.message });
   }
});

// 5. Razorpay Webhook (Verifies payment and upgrades user)
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
   try {
       // Note: To use req.body as a buffer for signature verification, 
       // express.raw() should be the only parser for this route.
       // However, since we used express.json() globally, we might need a workaround.
       // For this simple implementation, we'll verify it using the parsed JSON.
       
       const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
       const signature = req.headers['x-razorpay-signature'];
       
       // Calculate signature
       const expectedSignature = crypto.createHmac('sha256', secret)
           .update(JSON.stringify(req.body))
           .digest('hex');

       if (expectedSignature === signature) {
           // Payment is legit!
           const event = req.body;
           if (event.event === 'payment.captured') {
               // We need the clerkUserId. Usually you pass it in the Razorpay Notes.
               const clerkUserId = event.payload.payment.entity.notes.clerkUserId;
               if (clerkUserId) {
                   await User.findOneAndUpdate(
                       { clerkUserId },
                       { is_premium: true }
                   );
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

app.listen(PORT, () => {
  console.log(\`🚀 Server running on port \${PORT}\`);
});
