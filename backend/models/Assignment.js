const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  subject:      { type: String, required: true },
  description:  { type: String },               // omit default '' — saves bytes when empty
  dueDate:      { type: Date, required: true },
  created_by:   { type: String, required: true }, // clerkUserId of the CR who posted it
  section_code: { type: String, required: true }, // e.g. "CSE-B-2025"
  pdf_key:      { type: String },               // Backblaze B2 object key — absent when no PDF
  pdf_filename: { type: String },               // absent when no PDF
  expiresAt: {
    type: Date,
    expires: 0  // MongoDB TTL — auto-deletes doc at this timestamp
  }
}, {
  timestamps: true,
  minimize: true,
});

// Index for fast section-based queries (most common query pattern)
AssignmentSchema.index({ section_code: 1, dueDate: -1 });

module.exports = mongoose.model('Assignment', AssignmentSchema);
