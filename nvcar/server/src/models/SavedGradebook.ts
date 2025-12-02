import mongoose, { Schema, Document } from 'mongoose'

export interface ISavedGradebook extends Document {
    studentId: string
    schoolYearId: string
    level: string
    classId: string
    templateId: string
    data: any // Snapshot of all relevant data
    createdAt: Date
}

const SavedGradebookSchema: Schema = new Schema({
    studentId: { type: String, required: true, index: true },
    schoolYearId: { type: String, required: true, index: true },
    level: { type: String, required: true, index: true },
    classId: { type: String, required: true },
    templateId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now }
})

export const SavedGradebook = mongoose.model<ISavedGradebook>('SavedGradebook', SavedGradebookSchema)
