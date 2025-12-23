import mongoose, { Schema, Document } from 'mongoose'

export interface ISavedGradebookMeta {
    templateVersion?: number
    dataVersion?: number
    signaturePeriodId?: string
    schoolYearId?: string
    level?: string
    snapshotReason?: 'promotion' | 'year_end' | 'manual' | 'sem1' | 'transfer' | 'exit'
    archivedAt?: Date
}

export interface ISavedGradebook extends Document {
    studentId: string
    schoolYearId: string
    level: string
    classId: string
    templateId: string
    data: any // Snapshot of all relevant data
    meta?: ISavedGradebookMeta // Versioning and archival metadata
    createdAt: Date
}

const SavedGradebookMetaSchema: Schema = new Schema({
    templateVersion: { type: Number },
    dataVersion: { type: Number },
    signaturePeriodId: { type: String },
    schoolYearId: { type: String },
    level: { type: String },
    snapshotReason: { type: String, enum: ['promotion', 'year_end', 'manual', 'sem1', 'transfer', 'exit'] },
    archivedAt: { type: Date }
}, { _id: false })

const SavedGradebookSchema: Schema = new Schema({
    studentId: { type: String, required: true, index: true },
    schoolYearId: { type: String, required: true, index: true },
    level: { type: String, required: true, index: true },
    classId: { type: String, required: true },
    templateId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    meta: { type: SavedGradebookMetaSchema },
    createdAt: { type: Date, default: Date.now }
})

// Compound index for efficient snapshot lookup
SavedGradebookSchema.index({ studentId: 1, schoolYearId: 1, templateId: 1 })

export const SavedGradebook = mongoose.model<ISavedGradebook>('SavedGradebook', SavedGradebookSchema)

