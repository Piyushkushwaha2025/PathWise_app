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
  pdf_url: {
    type: String,
    default: null   // Cloudflare R2 public URL
  },
  pdf_filename: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Assignment', AssignmentSchema);
