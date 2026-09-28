const mongoose = require('mongoose');

const UserAssignmentSchema = new mongoose.Schema({
  clerkUserId:  { type: String, required: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  status: {
    type: String,
    enum: ['pending', 'submitted'],
    // No default — server checks presence, avoids storing 'pending' in every new doc
  },
  submittedAt: { type: Date },   // omit default null — saves field when not submitted
}, {
  timestamps: false,  // Not needed — createdAt not used anywhere for UserAssignment
  minimize: true,
});

// Ensure a user can only have one tracking record per assignment
UserAssignmentSchema.index({ clerkUserId: 1, assignmentId: 1 }, { unique: true });

// TTL: Auto-delete UserAssignment tracking records 90 days after submission
// This prevents indefinite accumulation of completed assignment records
UserAssignmentSchema.index({ submittedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, sparse: true });

module.exports = mongoose.model('UserAssignment', UserAssignmentSchema);
