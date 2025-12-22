/**
 * Unit tests for readinessUtils
 * 
 * Tests for:
 * - computeSignaturePeriodId: Deterministic period ID generation
 * - parseSignaturePeriodId: Parsing period IDs back to components
 * - sanitizeDataForNewAssignment: Allowlist-based data sanitization
 * - buildSavedGradebookMeta: Meta object construction
 */

import {
    computeSignaturePeriodId,
    parseSignaturePeriodId,
    sanitizeDataForNewAssignment,
    buildSavedGradebookMeta,
    SAFE_DATA_FIELDS_ALLOWLIST,
    SYSTEM_FIELDS_BLOCKLIST,
    SignaturePeriodType
} from '../utils/readinessUtils'

describe('readinessUtils', () => {
    describe('computeSignaturePeriodId', () => {
        it('generates deterministic period ID for sem1', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'
            const result = computeSignaturePeriodId(schoolYearId, 'sem1')
            expect(result).toBe('507f1f77bcf86cd799439011_sem1')
        })

        it('generates deterministic period ID for sem2', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'
            const result = computeSignaturePeriodId(schoolYearId, 'sem2')
            expect(result).toBe('507f1f77bcf86cd799439011_sem2')
        })

        it('generates deterministic period ID for end_of_year', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'
            const result = computeSignaturePeriodId(schoolYearId, 'end_of_year')
            expect(result).toBe('507f1f77bcf86cd799439011_end_of_year')
        })

        it('throws error when schoolYearId is empty', () => {
            expect(() => computeSignaturePeriodId('', 'sem1')).toThrow('schoolYearId is required')
        })

        it('is deterministic - same inputs produce same output', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'
            const periodType: SignaturePeriodType = 'sem1'

            const result1 = computeSignaturePeriodId(schoolYearId, periodType)
            const result2 = computeSignaturePeriodId(schoolYearId, periodType)
            const result3 = computeSignaturePeriodId(schoolYearId, periodType)

            expect(result1).toBe(result2)
            expect(result2).toBe(result3)
        })

        it('produces different IDs for different periods', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'

            const sem1 = computeSignaturePeriodId(schoolYearId, 'sem1')
            const sem2 = computeSignaturePeriodId(schoolYearId, 'sem2')
            const endOfYear = computeSignaturePeriodId(schoolYearId, 'end_of_year')

            expect(sem1).not.toBe(sem2)
            expect(sem2).not.toBe(endOfYear)
            expect(sem1).not.toBe(endOfYear)
        })

        it('produces different IDs for different school years', () => {
            const year1 = computeSignaturePeriodId('year1id', 'sem1')
            const year2 = computeSignaturePeriodId('year2id', 'sem1')

            expect(year1).not.toBe(year2)
        })
    })

    describe('parseSignaturePeriodId', () => {
        it('parses sem1 period ID correctly', () => {
            const result = parseSignaturePeriodId('507f1f77bcf86cd799439011_sem1')
            expect(result).toEqual({
                schoolYearId: '507f1f77bcf86cd799439011',
                periodType: 'sem1'
            })
        })

        it('parses sem2 period ID correctly', () => {
            const result = parseSignaturePeriodId('507f1f77bcf86cd799439011_sem2')
            expect(result).toEqual({
                schoolYearId: '507f1f77bcf86cd799439011',
                periodType: 'sem2'
            })
        })

        it('parses end_of_year period ID correctly', () => {
            const result = parseSignaturePeriodId('507f1f77bcf86cd799439011_end_of_year')
            expect(result).toEqual({
                schoolYearId: '507f1f77bcf86cd799439011',
                periodType: 'end_of_year'
            })
        })

        it('returns null for empty input', () => {
            expect(parseSignaturePeriodId('')).toBeNull()
        })

        it('returns null for invalid period type', () => {
            expect(parseSignaturePeriodId('507f1f77bcf86cd799439011_invalid')).toBeNull()
        })

        it('handles school year IDs that contain underscores', () => {
            // Edge case: schoolYearId might contain underscores
            const result = parseSignaturePeriodId('year_with_underscore_sem1')
            expect(result).toEqual({
                schoolYearId: 'year_with_underscore',
                periodType: 'sem1'
            })
        })

        it('roundtrips correctly', () => {
            const schoolYearId = '507f1f77bcf86cd799439011'
            const periodType: SignaturePeriodType = 'end_of_year'

            const periodId = computeSignaturePeriodId(schoolYearId, periodType)
            const parsed = parseSignaturePeriodId(periodId)

            expect(parsed?.schoolYearId).toBe(schoolYearId)
            expect(parsed?.periodType).toBe(periodType)
        })
    })

    describe('sanitizeDataForNewAssignment', () => {
        it('adds copiedFrom metadata', () => {
            const data = { language_toggle_0_1: ['fr', 'en'] }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result._copiedFrom).toBeDefined()
            expect(result._copiedFrom.assignmentId).toBe('source123')
            expect(result._copiedFrom.copiedAt).toBeInstanceOf(Date)
        })

        it('copies allowed fields (language_toggle_)', () => {
            const data = {
                language_toggle_0_1: ['fr', 'en'],
                language_toggle_2_3: ['ar']
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result.language_toggle_0_1).toEqual(['fr', 'en'])
            expect(result.language_toggle_2_3).toEqual(['ar'])
        })

        it('copies allowed fields (table_)', () => {
            const data = {
                table_0_1_row_0: { lang: 'fr' },
                table_2_3_row_5: { lang: 'en' }
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result.table_0_1_row_0).toEqual({ lang: 'fr' })
            expect(result.table_2_3_row_5).toEqual({ lang: 'en' })
        })

        it('removes system fields (signatures)', () => {
            const data = {
                signatures: [{ type: 'standard', signedAt: new Date() }],
                language_toggle_0_1: ['fr']
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result.signatures).toBeUndefined()
            expect(result.language_toggle_0_1).toEqual(['fr'])
        })

        it('removes system fields (promotions)', () => {
            const data = {
                promotions: [{ from: 'PS', to: 'MS' }],
                language_toggle_0_1: ['fr']
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result.promotions).toBeUndefined()
        })

        it('removes system fields (completed, completedSem1, etc)', () => {
            const data = {
                completed: true,
                completedSem1: true,
                completedSem2: false,
                completedAt: new Date(),
                completedAtSem1: new Date(),
                isCompleted: true,
                language_toggle_0_1: ['fr']
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result.completed).toBeUndefined()
            expect(result.completedSem1).toBeUndefined()
            expect(result.completedSem2).toBeUndefined()
            expect(result.completedAt).toBeUndefined()
            expect(result.completedAtSem1).toBeUndefined()
            expect(result.isCompleted).toBeUndefined()
        })

        it('removes internal metadata fields (starting with _)', () => {
            const data = {
                _internalField: 'secret',
                _version: 5,
                language_toggle_0_1: ['fr']
            }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            expect(result._internalField).toBeUndefined()
            expect(result._version).toBeUndefined()
            // But _copiedFrom is added by the function
            expect(result._copiedFrom).toBeDefined()
        })

        it('handles null input', () => {
            const result = sanitizeDataForNewAssignment(null as any, 'source123')

            expect(result._copiedFrom).toBeDefined()
            expect(Object.keys(result).length).toBe(1) // Only _copiedFrom
        })

        it('handles undefined input', () => {
            const result = sanitizeDataForNewAssignment(undefined as any, 'source123')

            expect(result._copiedFrom).toBeDefined()
        })

        it('deep copies values to prevent reference sharing', () => {
            const originalArray = ['fr', 'en']
            const data = { language_toggle_0_1: originalArray }
            const result = sanitizeDataForNewAssignment(data, 'source123')

            // Modify original
            originalArray.push('ar')

            // Result should not be affected
            expect(result.language_toggle_0_1).toEqual(['fr', 'en'])
        })
    })

    describe('buildSavedGradebookMeta', () => {
        it('builds meta object with all required fields', () => {
            const result = buildSavedGradebookMeta({
                templateVersion: 3,
                dataVersion: 5,
                signaturePeriodId: '507f1f77bcf86cd799439011_end_of_year',
                schoolYearId: '507f1f77bcf86cd799439011',
                level: 'MS',
                snapshotReason: 'promotion'
            })

            expect(result.templateVersion).toBe(3)
            expect(result.dataVersion).toBe(5)
            expect(result.signaturePeriodId).toBe('507f1f77bcf86cd799439011_end_of_year')
            expect(result.schoolYearId).toBe('507f1f77bcf86cd799439011')
            expect(result.level).toBe('MS')
            expect(result.snapshotReason).toBe('promotion')
            expect(result.archivedAt).toBeInstanceOf(Date)
        })

        it('sets archivedAt to current time', () => {
            const before = new Date()
            const result = buildSavedGradebookMeta({
                templateVersion: 1,
                dataVersion: 1,
                signaturePeriodId: 'test_sem1',
                schoolYearId: 'test',
                level: 'PS',
                snapshotReason: 'year_end'
            })
            const after = new Date()

            expect(result.archivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
            expect(result.archivedAt.getTime()).toBeLessThanOrEqual(after.getTime())
        })
    })

    describe('SAFE_DATA_FIELDS_ALLOWLIST', () => {
        it('contains expected prefixes', () => {
            expect(SAFE_DATA_FIELDS_ALLOWLIST).toContain('language_toggle_')
            expect(SAFE_DATA_FIELDS_ALLOWLIST).toContain('table_')
            expect(SAFE_DATA_FIELDS_ALLOWLIST).toContain('dropdown_')
            expect(SAFE_DATA_FIELDS_ALLOWLIST).toContain('text_')
        })
    })

    describe('SYSTEM_FIELDS_BLOCKLIST', () => {
        it('contains system fields that should never be copied', () => {
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('signatures')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('promotions')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('completed')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('completedSem1')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('completedSem2')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('isCompleted')
            expect(SYSTEM_FIELDS_BLOCKLIST).toContain('status')
        })
    })
})
