import { Schema, model } from 'mongoose'

const studentSchema = new Schema({
  logicalKey: { type: String, unique: true, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  avatarUrl: { type: String },
  parentName: { type: String },
  parentPhone: { type: String },
})

export const Student = model('Student', studentSchema)
