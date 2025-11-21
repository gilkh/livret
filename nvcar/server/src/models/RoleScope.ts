import { Schema, model } from 'mongoose'

const roleScopeSchema = new Schema({
  userId: { type: String, unique: true, required: true },
  schoolYearId: { type: String },
  levels: { type: [String], default: [] },
  classIds: { type: [String], default: [] },
  categoryIds: { type: [String], default: [] },
})

export const RoleScope = model('RoleScope', roleScopeSchema)
