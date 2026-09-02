const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true
  },

  uid: {
    type: String
  },
  app_first_opened_date: {
    type: Date,
    default: Date.now
  },
  free_ai_subject_id: {
    type: String,
    default: null
  },
  is_premium: {
    type: Boolean,
    default: false
  },
  subscription_plan: {
    type: String,
    default: 'free'
  },
  subscription_updated_at: {
    type: Date,
    default: Date.now
  },
  expoPushToken: {
    type: String,
    default: null
  },
  // CR Sub-Admin System
  role: {
    type: String,
    enum: ['student', 'cr', 'admin'],
    default: 'student'
  },
  section_code: {
    type: String,
    default: null  // e.g. "CSE-B-2025" — the class/section this CR manages
  },

  // 🪙 Reward System
  token_balance: {
    type: Number,
    default: 0
  },
  ads_watched_today: {
    type: Number,
    default: 0
  },
  last_ad_watch_date: {
    type: String,
    default: null  // "2026-09-02" format — reset daily
  },
  last_daily_bonus_date: {
    type: String,
    default: null  // "2026-09-02" format
  },
  premium_expires_at: {
    type: Number,
    default: null  // Unix timestamp ms — for token-earned premium
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
