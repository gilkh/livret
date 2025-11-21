import { Schema, model } from 'mongoose'

const blockSchema = new Schema({
  type: { type: String, required: true },
  props: { type: Schema.Types.Mixed, default: {} },
})

const pageSchema = new Schema({
  title: { type: String },
  layout: { type: String, default: 'single' },
  blocks: { type: [blockSchema], default: [] },
})

const templateSchema = new Schema({
  name: { type: String, required: true },
  pages: { type: [pageSchema], default: [] },
  createdBy: { type: String },
  updatedAt: { type: Date, default: () => new Date() },
  exportPassword: { type: String },
  status: { type: String, default: 'draft' },
  variables: { type: Schema.Types.Mixed, default: {} },
  watermark: { type: Schema.Types.Mixed },
  permissions: { type: Schema.Types.Mixed, default: { roles: ['ADMIN','SUBADMIN'] } },
  shareId: { type: String },
  versions: { type: [Schema.Types.Mixed], default: [] },
  comments: { type: [Schema.Types.Mixed], default: [] },
})

export const GradebookTemplate = model('GradebookTemplate', templateSchema)
