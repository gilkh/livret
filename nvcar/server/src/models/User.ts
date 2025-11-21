import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN','SUBADMIN','TEACHER'], required: true },
  displayName: { type: String, required: true },
})

export const User = model('User', userSchema)
