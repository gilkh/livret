/**
 * MongoDB Transaction Utilities
 * 
 * Provides standardized transaction handling for multi-step operations.
 * Ensures atomic operations with automatic rollback on failure.
 * 
 * Handles environments that don't support transactions (standalone MongoDB)
 * by falling back to non-transactional execution with a warning.
 */

import mongoose, { ClientSession } from 'mongoose'

export interface TransactionResult<T> {
  success: boolean
  data?: T
  error?: string
  usedTransaction: boolean
}

export interface TransactionOptions {
  /** If true, throws an error when transactions are not supported instead of falling back */
  requireTransaction?: boolean
  /** Maximum number of retry attempts for transient errors */
  maxRetries?: number
  /** Custom error handler */
  onError?: (error: Error, attempt: number) => void
}

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
export async function withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  options: TransactionOptions = {}
): Promise<TransactionResult<T>> {
  const { requireTransaction = false, maxRetries = 3, onError } = options
  
  const session = await mongoose.startSession()
  let usedTransaction = true
  let attempt = 0
  
  try {
    while (attempt < maxRetries) {
      attempt++
      
      try {
        // Try to start a transaction
        try {
          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
          })
        } catch (startError: any) {
          // Transaction not supported (standalone MongoDB)
          const msg = String(startError?.message || '')
          if (msg.includes('Transaction numbers are only allowed') || 
              msg.includes('not supported')) {
            usedTransaction = false
            
            if (requireTransaction) {
              throw new Error('Transactions are required but not supported in this MongoDB deployment')
            }
            
            console.warn('[Transaction] Transactions not supported, executing without transaction protection')
            
            // Execute without transaction
            const result = await fn(session)
            return { success: true, data: result, usedTransaction: false }
          }
          throw startError
        }
        
        // Execute the function within the transaction
        const result = await fn(session)
        
        // Commit the transaction
        await session.commitTransaction()
        
        return { success: true, data: result, usedTransaction: true }
        
      } catch (error: any) {
        // Handle transaction errors
        const errorMsg = String(error?.message || '')
        const errorCode = error?.code
        
        // Check if we should retry (transient errors)
        const isTransientError = 
          error?.hasErrorLabel?.('TransientTransactionError') ||
          errorCode === 112 || // WriteConflict
          errorCode === 251 || // TransactionAborted
          errorMsg.includes('TransientTransactionError')
        
        // Abort the transaction if it's still active
        try {
          if (session.inTransaction()) {
            await session.abortTransaction()
          }
        } catch (abortError) {
          // Ignore abort errors
        }
        
        if (onError) {
          onError(error, attempt)
        }
        
        // Retry transient errors
        if (isTransientError && attempt < maxRetries) {
          console.warn(`[Transaction] Transient error on attempt ${attempt}, retrying...`, errorMsg)
          continue
        }
        
        // Check for transaction not supported error during execution
        if (errorMsg.includes('Transaction numbers are only allowed')) {
          usedTransaction = false
          
          if (requireTransaction) {
            throw new Error('Transactions are required but not supported in this MongoDB deployment')
          }
          
          console.warn('[Transaction] Transactions not supported, retrying without transaction')
          
          // Retry without transaction
          const result = await fn(session)
          return { success: true, data: result, usedTransaction: false }
        }
        
        // Non-retryable error
        throw error
      }
    }
    
    // Should not reach here, but just in case
    return { 
      success: false, 
      error: 'Max retries exceeded', 
      usedTransaction 
    }
    
  } catch (error: any) {
    return { 
      success: false, 
      error: error?.message || String(error), 
      usedTransaction 
    }
  } finally {
    await session.endSession()
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
export async function withTransactionBatch<T>(
  operations: Array<(session: ClientSession) => Promise<T>>,
  options: TransactionOptions = {}
): Promise<TransactionResult<T[]>> {
  return withTransaction(async (session) => {
    const results: T[] = []
    for (const op of operations) {
      const result = await op(session)
      results.push(result)
    }
    return results
  }, options)
}

/**
 * Check if the current MongoDB deployment supports transactions.
 * 
 * Transactions require a replica set or sharded cluster.
 * Standalone MongoDB instances do not support transactions.
 */
export async function supportsTransactions(): Promise<boolean> {
  const session = await mongoose.startSession()
  try {
    session.startTransaction()
    await session.abortTransaction()
    return true
  } catch (error: any) {
    const msg = String(error?.message || '')
    if (msg.includes('Transaction numbers are only allowed') || 
        msg.includes('not supported')) {
      return false
    }
    // Other errors might indicate support but with issues
    return true
  } finally {
    await session.endSession()
  }
}
