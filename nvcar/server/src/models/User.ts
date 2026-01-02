import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  // Authentication provider for the account. Microsoft OAuth users still keep a dummy passwordHash.
  authProvider: { type: String, enum: ['local', 'microsoft'], default: 'local' },
  role: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER', 'AEFE'], required: true },
  displayName: { type: String, required: true },
  signatureUrl: { type: String },
  lastActive: { type: Date },
  tokenVersion: { type: Number, default: 0 },
  bypassScopes: [{
    type: { type: String, enum: ['ALL', 'LEVEL', 'CLASS', 'STUDENT'], required: true },
    value: { type: String } // Level name, Class ID, or Student ID. Empty for ALL.
  }],
  // Soft-delete support
  status: { type: String, enum: ['active', 'inactive', 'deleted'], default: 'active' },
  deletedAt: { type: Date },
  deletedBy: { type: String },
})

// Index for quick lookup of active users
userSchema.index({ status: 1 })
userSchema.index({ role: 1, status: 1 })

export const User = model('User', userSchema)
