import { Router } from 'express'
import { requireAuth } from '../auth'
import { TemplateChangeSuggestion } from '../models/TemplateChangeSuggestion'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { User } from '../models/User'

export const suggestionsRouter = Router()

// Create a suggestion (SubAdmin)
suggestionsRouter.post('/', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const { type = 'template_edit', templateId, pageIndex, blockIndex, originalText, suggestedText } = req.body
        const subAdminId = (req as any).user.userId

        const suggestion = await TemplateChangeSuggestion.create({
            subAdminId,
            type,
            templateId,
            pageIndex,
            blockIndex,
            originalText,
            suggestedText
        })

        res.json(suggestion)
    } catch (e: any) {
        res.status(500).json({ error: 'create_failed', message: e.message })
    }
})

// Get all suggestions (Admin)
suggestionsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const suggestions = await TemplateChangeSuggestion.find()
            .sort({ createdAt: -1 })
            .lean()

        // Populate subAdmin details manually or via populate if schema allowed ref
        const subAdminIds = [...new Set(suggestions.map(s => s.subAdminId))]
        const subAdmins = await User.find({ _id: { $in: subAdminIds } }).lean()
        const subAdminMap = subAdmins.reduce((acc, curr) => ({ ...acc, [String(curr._id)]: curr }), {} as any)

        // Populate template names
        const templateIds = [...new Set(suggestions.map(s => s.templateId).filter(Boolean))]
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
        const templateMap = templates.reduce((acc, curr) => ({ ...acc, [String(curr._id)]: curr }), {} as any)

        const enriched = suggestions.map(s => ({
            ...s,
            subAdmin: s.subAdminId ? subAdminMap[s.subAdminId] : undefined,
            template: s.templateId ? templateMap[s.templateId] : undefined
        }))

        res.json(enriched)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Update suggestion status (Admin)
suggestionsRouter.patch('/:id', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { status, adminComment } = req.body
        const suggestion = await TemplateChangeSuggestion.findById(req.params.id)

        if (!suggestion) return res.status(404).json({ error: 'not_found' })

        if (status === 'approved' && suggestion.type === 'template_edit' && suggestion.templateId) {
            // Apply change to template
            const template = await GradebookTemplate.findById(suggestion.templateId)
            if (template && typeof suggestion.pageIndex === 'number' && typeof suggestion.blockIndex === 'number') {
                // Ensure indices are valid
                if (template.pages[suggestion.pageIndex] &&
                    template.pages[suggestion.pageIndex].blocks[suggestion.blockIndex]) {

                    const block = template.pages[suggestion.pageIndex].blocks[suggestion.blockIndex]

                    if (block.type === 'dropdown') {
                        block.props.options = suggestion.suggestedText.split('\n').map(s => s.trim()).filter(s => s)
                    } else if (block.props && typeof block.props.content === 'string') {
                        block.props.content = suggestion.suggestedText
                    } else if (block.props && typeof block.props.text === 'string') {
                        block.props.text = suggestion.suggestedText
                    } else {
                        block.props = { ...block.props, content: suggestion.suggestedText }
                    }

                    template.markModified('pages')
                    await template.save()
                }
            }
        }

        suggestion.status = status
        if (adminComment) suggestion.adminComment = adminComment
        suggestion.updatedAt = new Date()
        await suggestion.save()

        res.json(suggestion)
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})
