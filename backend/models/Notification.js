const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  message:      { type: String, required: true },
  created_by:   { type: String, required: true }, // clerkUserId of the CR
  section_code: { type: String, required: true }, // e.g. "CSE-B-2025"
  expiresAt:    { type: Date, required: true },
  pdf_key:      { type: String },               // absent when no attachment
  pdf_filename: { type: String },               // absent when no attachment
}, {
  timestamps: true,
  minimize: true,
});

// TTL index — auto-deletes notification document when expiresAt is reached
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for fast section-based queries
NotificationSchema.index({ section_code: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
