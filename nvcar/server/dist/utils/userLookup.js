"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupUser = lookupUser;
exports.lookupUsers = lookupUsers;
exports.enrichWithUser = enrichWithUser;
exports.enrichArrayWithUsers = enrichArrayWithUsers;
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
/**
 * Lookup a user by ID with graceful fallback for deleted/orphaned users.
 * Returns a normalized user object or a placeholder if not found.
 */
async function lookupUser(userId) {
    if (!userId) {
        return {
            _id: '',
            displayName: 'Unknown User',
            email: '',
            status: 'not_found',
            isOrphaned: true
        };
    }
    // Try regular User collection first
    const user = await User_1.User.findById(userId).lean();
    if (user) {
        return {
            _id: String(user._id),
            displayName: user.displayName || user.email,
            email: user.email,
            role: user.role,
            status: user.status || 'active',
            isOrphaned: false
        };
    }
    // Try OutlookUser collection
    const outlookUser = await OutlookUser_1.OutlookUser.findById(userId).lean();
    if (outlookUser) {
        return {
            _id: String(outlookUser._id),
            displayName: outlookUser.displayName || outlookUser.email,
            email: outlookUser.email,
            role: outlookUser.role,
            status: 'active',
            isOrphaned: false
        };
    }
    // User not found - return placeholder
    return {
        _id: userId,
        displayName: 'Deleted User',
        email: '',
        status: 'not_found',
        isOrphaned: true
    };
}
/**
 * Lookup multiple users by IDs with graceful fallback.
 * Returns a Map of userId -> user info
 */
async function lookupUsers(userIds) {
    const result = new Map();
    // Filter out nulls and get unique IDs
    const uniqueIds = Array.from(new Set(userIds.filter((id) => !!id)));
    if (uniqueIds.length === 0)
        return result;
    // Batch lookup from both collections
    const [users, outlookUsers] = await Promise.all([
        User_1.User.find({ _id: { $in: uniqueIds } }).lean(),
        OutlookUser_1.OutlookUser.find({ _id: { $in: uniqueIds } }).lean()
    ]);
    // Index found users
    for (const user of users) {
        result.set(String(user._id), {
            _id: String(user._id),
            displayName: user.displayName || user.email,
            email: user.email,
            role: user.role,
            status: user.status || 'active',
            isOrphaned: false
        });
    }
    for (const user of outlookUsers) {
        if (!result.has(String(user._id))) {
            result.set(String(user._id), {
                _id: String(user._id),
                displayName: user.displayName || user.email,
                email: user.email,
                role: user.role,
                status: 'active',
                isOrphaned: false
            });
        }
    }
    // For any IDs not found, add placeholder
    for (const id of uniqueIds) {
        if (!result.has(id)) {
            result.set(id, {
                _id: id,
                displayName: 'Deleted User',
                email: '',
                status: 'not_found',
                isOrphaned: true
            });
        }
    }
    return result;
}
/**
 * Enrich an object with user display info for a given field.
 * Example: enrichWithUser(assignment, 'completedBy', 'completedByUser')
 */
async function enrichWithUser(obj, userIdField, targetField) {
    const userId = obj[userIdField];
    const userInfo = await lookupUser(userId);
    return {
        ...obj,
        [targetField]: userInfo
    };
}
/**
 * Enrich an array of objects with user display info.
 * More efficient than individual lookups - batches the query.
 */
async function enrichArrayWithUsers(arr, userIdField, targetField) {
    if (arr.length === 0)
        return arr;
    const userIds = arr.map(item => item[userIdField]);
    const userMap = await lookupUsers(userIds);
    return arr.map(item => ({
        ...item,
        [targetField]: userMap.get(item[userIdField]) || {
            _id: '',
            displayName: 'Unknown User',
            email: '',
            status: 'not_found',
            isOrphaned: true
        }
    }));
}
