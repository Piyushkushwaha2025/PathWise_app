const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  dueDate: {
    type: Date,
    required: true
  },
  // CR Sub-Admin additions
  created_by: {
    type: String,   // clerkUserId of the CR who posted it
    required: true
  },
  section_code: {
    type: String,   // e.g. "CSE-B-2025" — only students of this section see it
    required: true
  },
  pdf_key: {
    type: String,
    default: null   // Backblaze B2 object key
  },
  pdf_filename: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    expires: 0 // Document will be automatically deleted at this time
  }
}, { timestamps: true });

module.exports = mongoose.model('Assignment', AssignmentSchema);
