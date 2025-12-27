import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

/**
 * Block Schema with mandatory stable blockId
 * 
 * Every block MUST have a unique, stable blockId that persists across page reordering,
 * additions, and deletions. This ensures student data always maps to the correct block.
 * 
 * The blockId is stored in props.blockId and is auto-generated if not provided.
 */
const blockSchema = new Schema({
  type: { type: String, required: true },
  props: { 
    type: Schema.Types.Mixed, 
    default: () => ({ blockId: randomUUID() }),
    // Ensure blockId is always present via pre-save hook
  },
})

// Pre-validate hook to ensure every block has a stable blockId
blockSchema.pre('validate', function(next) {
  if (!this.props) {
    this.props = {}
  }
  if (!this.props.blockId || typeof this.props.blockId !== 'string' || !this.props.blockId.trim()) {
    this.props.blockId = randomUUID()
  }
  next()
})

const pageSchema = new Schema({
  title: { type: String },
  layout: { type: String, default: 'single' },
  excludeFromPdf: { type: Boolean, default: false },
  blocks: { type: [blockSchema], default: [] },
})

const templateSchema = new Schema({
  name: { type: String, required: true },
  defaultForLevels: { type: [String], default: [] },
  pages: { type: [pageSchema], default: [] },
  createdBy: { type: String },
  updatedAt: { type: Date, default: () => new Date() },
  exportPassword: { type: String },
  status: { type: String, default: 'draft' },
  variables: { type: Schema.Types.Mixed, default: {} },
  watermark: { type: Schema.Types.Mixed },
  permissions: { type: Schema.Types.Mixed, default: { roles: ['ADMIN', 'SUBADMIN'] } },
  shareId: { type: String },
  versions: { type: [Schema.Types.Mixed], default: [] },
  comments: { type: [Schema.Types.Mixed], default: [] },
  currentVersion: { type: Number, default: 1 },
  versionHistory: {
    type: [{
      version: { type: Number, required: true },
      pages: { type: [pageSchema], required: true },
      variables: { type: Schema.Types.Mixed, default: {} },
      watermark: { type: Schema.Types.Mixed },
      createdAt: { type: Date, required: true },
      createdBy: { type: String, required: true },
      changeDescription: { type: String }
    }],
    default: []
  }
})

export const GradebookTemplate = model('GradebookTemplate', templateSchema)
