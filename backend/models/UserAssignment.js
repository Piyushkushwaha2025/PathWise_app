const mongoose = require('mongoose');

const UserAssignmentSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true
  },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Ensure a user can only have one tracking record per assignment
UserAssignmentSchema.index({ clerkUserId: 1, assignmentId: 1 }, { unique: true });

module.exports = mongoose.model('UserAssignment', UserAssignmentSchema);
