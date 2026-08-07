const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  created_by: {
    type: String,   // clerkUserId of the CR who posted it
    required: true
  },
  section_code: {
    type: String,   // e.g. "CSE-B-2025" — only students of this section see it
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// TTL index to automatically delete documents when expiresAt is reached
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', NotificationSchema);
