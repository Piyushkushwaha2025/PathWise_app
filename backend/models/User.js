const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true
  },

  uid: { type: String, default: null },
  name: { type: String, default: null },
  email: { type: String, default: null },
  emailHash: { type: String, default: null },
  semester: { type: String, default: null },

  free_ai_subject_id: { type: String, default: null },
  is_premium:         { type: Boolean, default: false },
  subscription_plan:  { type: String, default: 'free' },
  expoPushToken:      { type: String, default: null },

  // CR Sub-Admin System
  role: {
    type: String,
    enum: ['student', 'cr', 'admin'],
    default: 'student',
  },
  section_code: { type: String, default: null },

  // 🪙 Reward System
  token_balance:      { type: Number, default: 0 },
  ads_watched_today:  { type: Number, default: 0 },
  daily_ad_views:     { type: Number, default: 0 },
  last_ad_watch_date: { type: String, default: null },         // "YYYY-MM-DD" format — reset daily
  last_ad_watch_time: { type: Date, default: null },
  last_daily_bonus_date: { type: String, default: null },      // "YYYY-MM-DD" format
  premium_expires_at: { type: Number, default: null },         // Unix ms timestamp — token-earned premium

  // 🎁 30-Day Free Trial
  trial_started_at: { type: Date, default: () => new Date() },

}, {
  timestamps: true,
  minimize: false, // Keep default/null keys visible in MongoDB Compass/Atlas
});

// Sparse index on uid
UserSchema.index({ uid: 1 }, { sparse: true });

// Sparse index on expoPushToken
UserSchema.index({ expoPushToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', UserSchema);
