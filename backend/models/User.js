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
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
