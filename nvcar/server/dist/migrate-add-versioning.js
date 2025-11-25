"use strict";
/**
 * Migration script to add versioning fields to existing templates
 * Run this once after deploying the new version
 *
 * Usage: ts-node migrate-add-versioning.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const GradebookTemplate_1 = require("./models/GradebookTemplate");
const TemplateAssignment_1 = require("./models/TemplateAssignment");
async function migrateTemplateVersioning() {
    try {
        await (0, db_1.connectDb)();
        console.log('Connected to database');
        // Find all templates without currentVersion field
        const templates = await GradebookTemplate_1.GradebookTemplate.find({
            $or: [
                { currentVersion: { $exists: false } },
                { versionHistory: { $exists: false } }
            ]
        });
        console.log(`Found ${templates.length} templates to migrate`);
        for (const template of templates) {
            // Add version fields if missing
            if (!template.currentVersion) {
                template.currentVersion = 1;
            }
            if (!template.versionHistory || template.versionHistory.length === 0) {
                template.versionHistory = [{
                        version: 1,
                        pages: template.pages,
                        variables: template.variables || {},
                        watermark: template.watermark,
                        createdAt: template.updatedAt || new Date(),
                        createdBy: template.createdBy || 'system',
                        changeDescription: 'Initial version (migrated)'
                    }];
            }
            await template.save();
            console.log(`✅ Migrated template: ${template.name} (ID: ${template._id})`);
        }
        // Find all template assignments without templateVersion field
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            templateVersion: { $exists: false }
        });
        console.log(`Found ${assignments.length} assignments to migrate`);
        for (const assignment of assignments) {
            // Get the template to find its current version
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId);
            if (template) {
                assignment.templateVersion = template.currentVersion || 1;
                await assignment.save();
                console.log(`✅ Migrated assignment for student ${assignment.studentId} to version ${assignment.templateVersion}`);
            }
            else {
                console.warn(`⚠️  Template not found for assignment ${assignment._id}`);
            }
        }
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}
// Run migration
migrateTemplateVersioning();
