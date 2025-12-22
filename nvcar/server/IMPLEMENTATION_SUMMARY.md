# Implementation Summary: DB-Level Guarantees and Atomic Promotion

## Overview

This implementation adds robust database-level guarantees for signatures and atomic promotion operations, centralizes readiness/completion logic, and improves data sanitization with explicit allowlist rules.

## Changes Made

### 1. DB-Level Guarantees for Signatures

**Files Modified:**
- `server/src/models/TemplateSignature.ts`

**Changes:**
- Added `signaturePeriodId` field (required) - deterministic identifier format: `{schoolYearId}_{periodType}`
- Added `schoolYearId` field for easier querying
- Created unique compound index on `(templateAssignmentId, type, signaturePeriodId, level)` to enforce DB-level uniqueness
- The unique index prevents duplicate signatures at the database level, eliminating race conditions

### 2. Centralized Readiness/Completion Logic

**Files Created:**
- `server/src/utils/readinessUtils.ts`

**New Utilities:**
- `computeSignaturePeriodId(schoolYearId, periodType)` - Generates deterministic period IDs
- `parseSignaturePeriodId(signaturePeriodId)` - Parses period IDs back to components
- `resolveCurrentSignaturePeriod()` - Determines current signature period from active school year
- `resolveEndOfYearSignaturePeriod()` - Resolves end-of-year signature period with next school year lookup
- `computeCompletionStatus(options)` - Single source of truth for completion/readiness status
- `validateSignatureReadiness(assignmentId, type, level)` - Validates signature can be created
- `validatePromotionReadiness(assignmentId, subAdminId)` - Validates promotion can be performed
- `sanitizeDataForNewAssignment(data, sourceId)` - Allowlist-based data sanitization with `copiedFrom` metadata
- `buildSavedGradebookMeta(params)` - Builds meta object for archived gradebooks

### 3. Atomic Promotion

**Files Modified:**
- `server/src/routes/subAdminTemplates.ts`

**Changes:**
- Added mongoose import for transactions
- Wrapped all promotion operations in MongoDB transaction:
  1. SavedGradebook creation (versioned snapshot)
  2. Current enrollment status update
  3. Next year enrollment creation
  4. Student promotion record update
  5. TemplateAssignment promotion data update
- All operations succeed or none do - prevents "half-promoted" students
- Includes fallback for environments without transaction support (standalone MongoDB)

### 4. Version Everything Archived

**Files Modified:**
- `server/src/models/SavedGradebook.ts`
- `server/src/routes/subAdminTemplates.ts`
- `server/src/routes/schoolYears.ts`

**Changes:**
- Added `meta` field to SavedGradebook schema:
  - `templateVersion` - Version of template used
  - `dataVersion` - Version of assignment data
  - `signaturePeriodId` - Signature period identifier
  - `schoolYearId` - School year reference
  - `level` - Student level at time of snapshot
  - `snapshotReason` - 'promotion' | 'year_end' | 'manual'
  - `archivedAt` - Timestamp of archival
- Updated promotion endpoint to include meta when creating snapshots
- Updated school year archive endpoint to include meta when creating snapshots

### 5. Allowlist-Based Data Sanitization

**Files Modified:**
- `server/src/utils/templateUtils.ts`
- `server/src/utils/readinessUtils.ts`

**Changes:**
- Replaced blacklist-based sanitization with explicit allowlist approach
- `SAFE_DATA_FIELDS_ALLOWLIST` - Prefixes of fields safe to copy:
  - `language_toggle_` - Language toggle data
  - `table_` - Table row language data
  - `dropdown_` - Dropdown values
  - `text_` - Text field values
- `SYSTEM_FIELDS_BLOCKLIST` - Fields that should never be copied:
  - signatures, promotions, active, completed, completedAt, completedBy, etc.
- Added `_copiedFrom` metadata to new assignments for traceability:
  - `assignmentId` - Source assignment ID
  - `copiedAt` - Timestamp of copy

### 6. Signature Service Updates

**Files Modified:**
- `server/src/services/signatureService.ts`

**Changes:**
- Integrated with centralized readiness utilities
- Added `signaturePeriodId` to all signature creation paths
- Updated `resolveSignatureSchoolYearWithPeriod()` to return signaturePeriodId
- All three signature creation code paths now include signaturePeriodId and schoolYearId

### 7. Migration Script

**Files Created:**
- `server/src/migrate-add-signature-period-id.ts`

**Purpose:**
- Adds signaturePeriodId to existing signatures that don't have one
- Computes period ID based on signature date and type
- Verifies unique index can be created after migration

**To Run:**
```bash
cd nvcar/server
npx ts-node src/migrate-add-signature-period-id.ts
```

## Testing Recommendations

1. **Signature Uniqueness:** Try to sign the same assignment twice for the same period - should fail with duplicate key error
2. **Atomic Promotion:** Simulate a failure mid-promotion to verify rollback works
3. **Data Sanitization:** Verify copiedFrom metadata appears in new assignments
4. **Archived Gradebooks:** Check that meta field contains version info after promotion/archival

## Breaking Changes

- `TemplateSignature.signaturePeriodId` is now required - run migration before deploying
- Existing signatures without signaturePeriodId will fail validation until migrated
