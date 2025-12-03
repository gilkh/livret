import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN','SUBADMIN','TEACHER','AEFE'], required: true },
  displayName: { type: String, required: true },
  signatureUrl: { type: String },
  lastActive: { type: Date },
  tokenVersion: { type: Number, default: 0 },
  bypassScopes: [{
    type: { type: String, enum: ['ALL', 'LEVEL', 'CLASS', 'STUDENT'], required: true },
    value: { type: String } // Level name, Class ID, or Student ID. Empty for ALL.
  }],
})

export const User = model('User', userSchema)
