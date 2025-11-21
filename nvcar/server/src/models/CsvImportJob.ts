import { Schema, model } from 'mongoose'

const jobSchema = new Schema({
  startedAt: { type: Date, default: () => new Date() },
  finishedAt: { type: Date, default: () => new Date() },
  addedCount: { type: Number, required: true },
  updatedCount: { type: Number, required: true },
  errorCount: { type: Number, required: true },
  reportJson: { type: String, required: true },
})

export const CsvImportJob = model('CsvImportJob', jobSchema)
