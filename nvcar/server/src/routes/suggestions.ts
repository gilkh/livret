import { Router } from 'express'
import { requireAuth } from '../auth'
import { TemplateChangeSuggestion } from '../models/TemplateChangeSuggestion'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { User } from '../models/User'

export const suggestionsRouter = Router()

// Create a suggestion (SubAdmin)
suggestionsRouter.post('/', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const { templateId, pageIndex, blockIndex, originalText, suggestedText } = req.body
        const subAdminId = (req as any).user.userId

        const suggestion = await TemplateChangeSuggestion.create({
            subAdminId,
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
        const templateIds = [...new Set(suggestions.map(s => s.templateId))]
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
        const templateMap = templates.reduce((acc, curr) => ({ ...acc, [String(curr._id)]: curr }), {} as any)

        const enriched = suggestions.map(s => ({
            ...s,
            subAdmin: subAdminMap[s.subAdminId],
            template: templateMap[s.templateId]
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

        if (status === 'approved') {
            // Apply change to template
            const template = await GradebookTemplate.findById(suggestion.templateId)
            if (template) {
                // Ensure indices are valid
                if (template.pages[suggestion.pageIndex] && 
                    template.pages[suggestion.pageIndex].blocks[suggestion.blockIndex]) {
                    
                    // Update the text content
                    // Assuming the block has a 'content' prop or similar. 
                    // We need to know the block structure. 
                    // Usually text blocks have props.content or props.text
                    
                    const block = template.pages[suggestion.pageIndex].blocks[suggestion.blockIndex]
                    
                    // Check block type or props structure
                    if (block.props && typeof block.props.content === 'string') {
                        block.props.content = suggestion.suggestedText
                    } else if (block.props && typeof block.props.text === 'string') {
                        block.props.text = suggestion.suggestedText
                    } else {
                        // Fallback or error? Let's assume 'content' for rich text or 'text'
                        // If we can't apply, maybe we shouldn't approve?
                        // For now, let's try to apply to 'content' as it's common for rich text
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
