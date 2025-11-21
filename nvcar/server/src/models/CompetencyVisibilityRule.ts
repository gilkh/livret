import { Schema, model } from 'mongoose'

const ruleSchema = new Schema({
  competencyId: { type: String, required: true },
  minAgeMonths: { type: Number },
  maxAgeMonths: { type: Number },
  levels: { type: [String], default: [] },
  classIds: { type: [String], default: [] },
})

export const CompetencyVisibilityRule = model('CompetencyVisibilityRule', ruleSchema)
