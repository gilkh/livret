import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { authRouter } from './routes/auth'
import { categoriesRouter } from './routes/categories'
import { studentsRouter } from './routes/students'
import { importRouter } from './routes/import'
import { pdfRouter } from './routes/pdf'
import { connectDb } from './db'
import { templatesRouter } from './routes/templates'
import { usersRouter } from './routes/users'
import { signaturesRouter } from './routes/signatures'
import { schoolYearsRouter } from './routes/schoolYears'
import { mediaRouter } from './routes/media'
import path from 'path'
import { User } from './models/User'
import * as bcrypt from 'bcryptjs'
import { classesRouter } from './routes/classes'
import { teacherAssignmentsRouter } from './routes/teacherAssignments'
import { templateAssignmentsRouter } from './routes/templateAssignments'
import { subAdminAssignmentsRouter } from './routes/subAdminAssignments'
import { teacherTemplatesRouter } from './routes/teacherTemplates'
import { subAdminTemplatesRouter } from './routes/subAdminTemplates'
import { auditLogsRouter } from './routes/auditLogs'
import { impersonationRouter } from './routes/impersonation'

export const createApp = () => {
  const app = express()
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (origin.startsWith('http://localhost:5173') || origin.startsWith('http://localhost:5174')) return cb(null, true)
      return cb(null, true)
    },
    credentials: true,
  }))
  app.use(bodyParser.json({ limit: '2mb' }))

  app.use('/auth', authRouter)
  app.use('/categories', categoriesRouter)
  app.use('/students', studentsRouter)
  app.use('/import', importRouter)
  app.use('/pdf', pdfRouter)
  app.use('/templates', templatesRouter)
  app.use('/users', usersRouter)
  app.use('/signatures', signaturesRouter)
  app.use('/school-years', schoolYearsRouter)
  app.use('/classes', classesRouter)
  app.use('/media', mediaRouter)
  app.use('/teacher-assignments', teacherAssignmentsRouter)
  app.use('/template-assignments', templateAssignmentsRouter)
  app.use('/subadmin-assignments', subAdminAssignmentsRouter)
  app.use('/teacher', teacherTemplatesRouter)
  app.use('/subadmin', subAdminTemplatesRouter)
  app.use('/audit-logs', auditLogsRouter)
  app.use('/impersonation', impersonationRouter)
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')))

  app.get('/health', (_, res) => res.json({ ok: true }))
  connectDb()
    .then(async () => {
      console.log('mongo connected')
      const admin = await User.findOne({ email: 'admin' })
      if (!admin) {
        const hash = await bcrypt.hash('admin', 10)
        await User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' })
        console.log('seeded default admin user')
      }
    })
    .catch(e => console.error('mongo error', e))
  return app
}
