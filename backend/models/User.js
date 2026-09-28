const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true
  },

  uid: { type: String },

  // Removed app_first_opened_date — createdAt (timestamps:true) serves same purpose
  // Removed subscription_updated_at — updatedAt (timestamps:true) covers it

  free_ai_subject_id: { type: String },         // omit default null — saves field storage
  is_premium:         { type: Boolean },         // omit default false — 0 bytes when absent
  subscription_plan:  { type: String },          // omit default 'free' — derived on read
  expoPushToken:      { type: String },          // null when not registered — omit default

  // CR Sub-Admin System
  role: {
    type: String,
    enum: ['student', 'cr', 'admin'],
    // No default — 'student' assumed server-side when absent (saves field in 99% of docs)
  },
  section_code: { type: String },               // null when not a CR — omit default

  // 🪙 Reward System — omit defaults of 0/null to avoid storing them in every doc
  token_balance:      { type: Number },
  ads_watched_today:  { type: Number },
  daily_ad_views:     { type: Number },
  last_ad_watch_date: { type: String },         // "YYYY-MM-DD" format — reset daily
  last_ad_watch_time: { type: Date },
  last_daily_bonus_date: { type: String },      // "YYYY-MM-DD" format
  premium_expires_at: { type: Number },         // Unix ms timestamp — token-earned premium

  // 🎁 30-Day Free Trial
  trial_started_at: { type: Date },

}, {
  timestamps: true,   // provides createdAt + updatedAt (replaces app_first_opened_date & subscription_updated_at)
  minimize: true,     // Mongoose: remove empty objects from docs — reduces stored BSON size
});

// Sparse index on uid — only indexes docs that HAVE a uid (saves index space since not all users link college ID)
UserSchema.index({ uid: 1 }, { sparse: true });

// Sparse index on expoPushToken — only indexes registered push devices
UserSchema.index({ expoPushToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', UserSchema);
