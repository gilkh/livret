/**
 * Migration script to add versioning fields to existing templates
 * Run this once after deploying the new version
 * 
 * Usage: ts-node migrate-add-versioning.ts
 */

import { connectDb } from './db'
import { GradebookTemplate } from './models/GradebookTemplate'
import { TemplateAssignment } from './models/TemplateAssignment'

async function migrateTemplateVersioning() {
    try {
        await connectDb()
        console.log('Connected to database')

        // Find all templates without currentVersion field
        const templates = await GradebookTemplate.find({
            $or: [
                { currentVersion: { $exists: false } },
                { versionHistory: { $exists: false } }
            ]
        })

        console.log(`Found ${templates.length} templates to migrate`)

        for (const template of templates) {
            // Add version fields if missing
            if (!template.currentVersion) {
                template.currentVersion = 1
            }

            if (!template.versionHistory || template.versionHistory.length === 0) {
                (template as any).versionHistory = [{
                    version: 1,
                    pages: template.pages,
                    variables: template.variables || {},
                    watermark: template.watermark,
                    createdAt: template.updatedAt || new Date(),
                    createdBy: template.createdBy || 'system',
                    changeDescription: 'Initial version (migrated)'
                }]
            }

            await template.save()
            console.log(`✅ Migrated template: ${template.name} (ID: ${template._id})`)
        }

        // Find all template assignments without templateVersion field
        const assignments = await TemplateAssignment.find({
            templateVersion: { $exists: false }
        })

        console.log(`Found ${assignments.length} assignments to migrate`)

        for (const assignment of assignments) {
            // Get the template to find its current version
            const template = await GradebookTemplate.findById(assignment.templateId)
            
            if (template) {
                assignment.templateVersion = template.currentVersion || 1
                await assignment.save()
                console.log(`✅ Migrated assignment for student ${assignment.studentId} to version ${assignment.templateVersion}`)
            } else {
                console.warn(`⚠️  Template not found for assignment ${assignment._id}`)
            }
        }

        console.log('✅ Migration completed successfully!')
        process.exit(0)
    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    }
}

// Run migration
migrateTemplateVersioning()
