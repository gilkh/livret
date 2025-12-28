"use strict";
/**
 * MongoDB Transaction Utilities
 *
 * Provides standardized transaction handling for multi-step operations.
 * Ensures atomic operations with automatic rollback on failure.
 *
 * Handles environments that don't support transactions (standalone MongoDB)
 * by falling back to non-transactional execution with a warning.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTransaction = withTransaction;
exports.withTransactionBatch = withTransactionBatch;
exports.supportsTransactions = supportsTransactions;
const mongoose_1 = __importDefault(require("mongoose"));
/**
 * Execute a function within a MongoDB transaction.
 *
 * This wrapper handles:
 * - Session creation and cleanup
 * - Transaction start/commit/abort
 * - Automatic retry for transient errors
 * - Graceful fallback for environments without transaction support
 *
 * @param fn - The async function to execute within the transaction
 * @param options - Transaction options
 * @returns TransactionResult with success status and data or error
 *
 * @example
 * ```typescript
 * const result = await withTransaction(async (session) => {
 *   await Student.create([{ name: 'John' }], { session })
 *   await Enrollment.create([{ studentId: '...' }], { session })
 *   return { created: true }
 * })
 *
 * if (!result.success) {
 *   console.error('Transaction failed:', result.error)
 * }
 * ```
 */
async function withTransaction(fn, options = {}) {
    const { requireTransaction = false, maxRetries = 3, onError } = options;
    const session = await mongoose_1.default.startSession();
    let usedTransaction = true;
    let attempt = 0;
    try {
        while (attempt < maxRetries) {
            attempt++;
            try {
                // Try to start a transaction
                try {
                    session.startTransaction({
                        readConcern: { level: 'snapshot' },
                        writeConcern: { w: 'majority' }
                    });
                }
                catch (startError) {
                    // Transaction not supported (standalone MongoDB)
                    const msg = String(startError?.message || '');
                    if (msg.includes('Transaction numbers are only allowed') ||
                        msg.includes('not supported')) {
                        usedTransaction = false;
                        if (requireTransaction) {
                            throw new Error('Transactions are required but not supported in this MongoDB deployment');
                        }
                        console.warn('[Transaction] Transactions not supported, executing without transaction protection');
                        // Execute without transaction
                        const result = await fn(session);
                        return { success: true, data: result, usedTransaction: false };
                    }
                    throw startError;
                }
                // Execute the function within the transaction
                const result = await fn(session);
                // Commit the transaction
                await session.commitTransaction();
                return { success: true, data: result, usedTransaction: true };
            }
            catch (error) {
                // Handle transaction errors
                const errorMsg = String(error?.message || '');
                const errorCode = error?.code;
                // Check if we should retry (transient errors)
                const isTransientError = error?.hasErrorLabel?.('TransientTransactionError') ||
                    errorCode === 112 || // WriteConflict
                    errorCode === 251 || // TransactionAborted
                    errorMsg.includes('TransientTransactionError');
                // Abort the transaction if it's still active
                try {
                    if (session.inTransaction()) {
                        await session.abortTransaction();
                    }
                }
                catch (abortError) {
                    // Ignore abort errors
                }
                if (onError) {
                    onError(error, attempt);
                }
                // Retry transient errors
                if (isTransientError && attempt < maxRetries) {
                    console.warn(`[Transaction] Transient error on attempt ${attempt}, retrying...`, errorMsg);
                    continue;
                }
                // Check for transaction not supported error during execution
                if (errorMsg.includes('Transaction numbers are only allowed')) {
                    usedTransaction = false;
                    if (requireTransaction) {
                        throw new Error('Transactions are required but not supported in this MongoDB deployment');
                    }
                    console.warn('[Transaction] Transactions not supported, retrying without transaction');
                    // Retry without transaction
                    const result = await fn(session);
                    return { success: true, data: result, usedTransaction: false };
                }
                // Non-retryable error
                throw error;
            }
        }
        // Should not reach here, but just in case
        return {
            success: false,
            error: 'Max retries exceeded',
            usedTransaction
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.message || String(error),
            usedTransaction
        };
    }
    finally {
        await session.endSession();
    }
}
/**
 * Execute multiple operations atomically within a transaction.
 *
 * This is a convenience wrapper for executing an array of operations
 * that should all succeed or all fail together.
 *
 * @param operations - Array of async functions to execute
 * @param options - Transaction options
 * @returns TransactionResult with array of results
 */
async function withTransactionBatch(operations, options = {}) {
    return withTransaction(async (session) => {
        const results = [];
        for (const op of operations) {
            const result = await op(session);
            results.push(result);
        }
        return results;
    }, options);
}
/**
 * Check if the current MongoDB deployment supports transactions.
 *
 * Transactions require a replica set or sharded cluster.
 * Standalone MongoDB instances do not support transactions.
 */
async function supportsTransactions() {
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        await session.abortTransaction();
        return true;
    }
    catch (error) {
        const msg = String(error?.message || '');
        if (msg.includes('Transaction numbers are only allowed') ||
            msg.includes('not supported')) {
            return false;
        }
        // Other errors might indicate support but with issues
        return true;
    }
    finally {
        await session.endSession();
    }
}
