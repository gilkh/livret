import { Schema, model } from 'mongoose'

export interface IOutlookUser {
  email: string
  role: 'ADMIN' | 'SUBADMIN' | 'TEACHER'
  displayName?: string
  createdAt: Date
  lastLogin?: Date
  signatureUrl?: string
}

const schema = new Schema<IOutlookUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, required: true, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'] },
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  signatureUrl: { type: String }
})

export const OutlookUser = model<IOutlookUser>('OutlookUser', schema)
