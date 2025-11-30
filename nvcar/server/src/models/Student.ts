import { Schema, model } from 'mongoose'

const studentSchema = new Schema({
  logicalKey: { type: String, unique: true, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  avatarUrl: { type: String },
  parentName: { type: String },
  parentPhone: { type: String },
  level: { type: String }, // Current level if not in a class, or cached level
  schoolYearId: { type: String }, // Current school year association
  promotions: [{
    schoolYearId: { type: String },
    date: { type: Date },
    fromLevel: { type: String },
    toLevel: { type: String },
    promotedBy: { type: String }
  }]
})

export const Student = model('Student', studentSchema)
