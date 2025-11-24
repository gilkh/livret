# New Features: View As & Template Versioning

## 🎯 Features Implemented

### 1. **"View As" Mode (Admin Impersonation)**
Allows administrators to see exactly what a teacher sees, perfect for debugging permission and visibility issues.

### 2. **Template Versioning**
Automatically preserves data integrity when templates are edited while teachers are using them.

### 3. **Concurrent Usage Safety**
Multiple teachers can safely use templates simultaneously without data conflicts.

---

## 🚀 Quick Start

### Running the Migration

After deploying the new version, run the migration script once:

```powershell
cd nvcar\server
npm run migrate
```

Or manually:
```powershell
cd nvcar\server
npx ts-node src/migrate-add-versioning.ts
```

This will add version fields to existing templates and assignments.

---

## 📖 Feature Documentation

### View As Mode

#### How to Use
1. **Admin Dashboard** → Navigate to **Users** page
2. Find the teacher or sub-admin you want to impersonate
3. Click the **"🚪 Login As"** button
4. **New tab opens** with their full dashboard view
5. You'll see an orange banner at the top showing impersonation status
6. Click **"🚪 Exit & Close Tab"** to close the impersonated session
7. Return to your original admin tab to continue admin work

#### What You Can Do
- ✅ See exactly what the user sees (full dashboard, not just templates)
- ✅ Access their classes and students
- ✅ View their assigned templates
- ✅ Test their complete workflow
- ✅ Navigate all their accessible pages
- ✅ Debug any visibility or access issues
- ✅ Work in separate tab without losing admin session

#### What You Cannot Do
- ❌ Impersonate other admins (security protection)
- ❌ Make changes without audit trail (all actions logged)

#### Visual Indicator
When in impersonation mode, you'll see an orange banner:
```
⚠️ ADMIN MODE: Logged in as [User Name] (ROLE)
Full account access • Original admin: [Your Name]
[🚪 Exit & Close Tab Button]
```

#### Key Features
- **Opens in New Tab**: Your admin session stays open in the original tab
- **Full Account Access**: See their complete dashboard, not just templates
- **Username Display**: All users see their name in the top-right navbar
- **Easy Exit**: Close the impersonated tab with one click

#### Use Cases
- 🔍 Teacher reports: "I can't see template X"
- 🔍 Debugging permission issues
- 🔍 Testing complete user workflows
- 🔍 Verifying assignments are correct
- 🔍 Quality assurance testing
- 🔍 Checking full dashboard functionality
- 🔍 Testing navigation and access controls
- 🔍 Reproducing user-reported issues

---

### Template Versioning

#### How It Works

**Automatic Versioning:**
- When an admin edits a template that has active assignments
- System automatically creates a new version
- Existing assignments continue using their original version
- New assignments use the latest version

**What Triggers a New Version:**
- ✅ Pages changed (add/remove/modify pages)
- ✅ Variables changed (template variables)
- ✅ Watermark changed
- ✅ Template has existing assignments

**What Doesn't Trigger a New Version:**
- ❌ Name changes
- ❌ Status changes (draft/published)
- ❌ Permission changes
- ❌ No active assignments exist

#### Example Timeline

```
Day 1: Admin creates "Math Skills Template" → Version 1
Day 2: Admin assigns to 10 students → All locked to Version 1
Day 3: Teachers start filling out templates → Using Version 1
Day 4: Admin edits template (adds new section) → Creates Version 2
Day 5: Teachers continue with Version 1 → No disruption
Day 6: New assignments use Version 2 → Latest version
```

#### Viewing Version History

Template data includes:
```typescript
{
  name: "Math Skills Template",
  currentVersion: 2,
  pages: [...],           // Current version pages
  versionHistory: [
    {
      version: 1,
      pages: [...],       // Version 1 pages
      variables: {...},
      createdAt: "2025-01-01",
      createdBy: "admin123",
      changeDescription: "Initial version"
    },
    {
      version: 2,
      pages: [...],       // Version 2 pages
      variables: {...},
      createdAt: "2025-01-15",
      createdBy: "admin123",
      changeDescription: "Added competency section"
    }
  ]
}
```

#### Benefits
- ✅ **Data Integrity**: Teachers' work is never lost or corrupted
- ✅ **No Interruption**: Teachers can continue working during updates
- ✅ **Historical Record**: Complete version history maintained
- ✅ **Flexibility**: Admins can edit templates anytime

---

### Concurrent Usage Safety

#### Is It Safe?

**YES!** Multiple teachers can safely use templates at the same time.

#### Why It's Safe

1. **Version Locking**
   - Each assignment is locked to a specific template version
   - Changes to templates don't affect in-progress work

2. **Document-Level Isolation**
   - Each student's data is stored separately in MongoDB
   - No conflicts between different students

3. **Atomic Operations**
   - Database operations are atomic and consistent
   - No data corruption or race conditions

4. **Independent Writes**
   - Teacher A updating Student 1 doesn't block Teacher B updating Student 2
   - Even on the same student, different fields can be updated simultaneously

#### Real-World Example

```
Scenario: 50 teachers working simultaneously

Teacher 1: Editing Student 1, Math Template v1    ✅ Safe
Teacher 2: Editing Student 2, Math Template v1    ✅ Safe
Teacher 3: Editing Student 3, Science Template v2 ✅ Safe
Admin:     Edits Math Template → Creates v3       ✅ Safe
Teacher 1: Continues with v1 (no change)          ✅ Safe
Teacher 4: New assignment gets v3                 ✅ Safe
```

---

## 🔒 Security & Audit

### Audit Logging

All sensitive actions are logged:

**Impersonation:**
```typescript
{
  action: "START_IMPERSONATION",
  userId: "admin123",
  details: {
    targetUserId: "teacher456",
    targetUserEmail: "teacher@school.com",
    targetUserRole: "TEACHER"
  }
}
```

**Template Changes:**
```typescript
{
  action: "EDIT_TEMPLATE",
  userId: "teacher123",  // Or actualUserId if impersonating
  details: {
    templateId: "template789",
    templateName: "Math Skills",
    version: 2,
    changeDescription: "Added new section"
  }
}
```

### Viewing Audit Logs

Admin Dashboard → **Journal d'activité** (Audit Logs)

---

## 🛠️ Technical Details

### API Endpoints

#### Impersonation
- `POST /impersonation/start` - Start impersonating a user
- `POST /impersonation/stop` - Stop impersonating
- `GET /impersonation/status` - Check current impersonation status

#### Templates (Enhanced)
- `GET /templates` - List all templates (includes version info)
- `PATCH /templates/:id` - Update template (auto-versioning)
- Template data now includes `currentVersion` and `versionHistory`

#### Template Assignments (Enhanced)
- `POST /template-assignments` - Create assignment (captures current version)
- Assignments now include `templateVersion` field

### Database Schema Changes

**GradebookTemplate:**
```typescript
{
  currentVersion: Number,      // NEW
  versionHistory: [{           // NEW
    version: Number,
    pages: Array,
    variables: Object,
    watermark: Object,
    createdAt: Date,
    createdBy: String,
    changeDescription: String
  }]
}
```

**TemplateAssignment:**
```typescript
{
  templateVersion: Number,     // NEW - Links to specific version
}
```

### Modified Files

**Server:**
- `src/auth.ts` - Added impersonation support to JWT
- `src/models/GradebookTemplate.ts` - Added version fields
- `src/models/TemplateAssignment.ts` - Added templateVersion
- `src/routes/impersonation.ts` - NEW - Impersonation API
- `src/routes/templates.ts` - Auto-versioning logic
- `src/routes/templateAssignments.ts` - Version capture
- `src/routes/teacherTemplates.ts` - Version-aware loading
- `src/app.ts` - Added impersonation router
- `src/migrate-add-versioning.ts` - NEW - Migration script

**Client:**
- `src/api.ts` - Added impersonation API functions
- `src/components/ImpersonationBanner.tsx` - NEW - Visual indicator
- `src/pages/Users.tsx` - Added "View As" button
- `src/App.tsx` - Show impersonation banner

---

## 📝 Best Practices

### For Admins

**Template Editing:**
1. ✅ Edit templates anytime (versioning protects data)
2. ✅ Use descriptive change descriptions
3. ✅ Test major changes with "View As" first
4. ✅ Check version history before editing

**Debugging:**
1. ✅ Use "View As" to reproduce teacher issues
2. ✅ Check audit logs for suspicious activity
3. ✅ Verify template versions in assignments
4. ✅ Always exit "View As" mode when done

**Assignment Management:**
1. ✅ Assign templates to multiple teachers freely
2. ✅ Don't worry about concurrent usage
3. ✅ Review audit logs periodically

### For Teachers

**Working with Templates:**
1. ✅ Save your work frequently
2. ✅ Complete assignments promptly
3. ✅ Report any visibility issues to admin
4. ✅ Don't worry about other teachers - work safely continues

### For Developers

**Deploying Updates:**
1. ✅ Run migration script after deploying
2. ✅ Test impersonation in staging first
3. ✅ Monitor audit logs after deployment
4. ✅ Backup database before major updates

**Maintaining the System:**
1. ✅ Regular database backups
2. ✅ Monitor version history size
3. ✅ Archive old versions if needed
4. ✅ Review audit logs periodically

---

## 🐛 Troubleshooting

### "I can't see a template"
1. Admin uses "View As" to impersonate the teacher
2. Verify what the teacher actually sees
3. Check template permissions
4. Check teacher-class assignments
5. Review audit logs for changes

### "Template looks different"
1. Check the assignment's `templateVersion`
2. Compare with template's `currentVersion`
3. If different, teacher is using an older version (by design)
4. To update: Delete and recreate the assignment (if appropriate)

### "Changes aren't saving"
1. Check network console for errors
2. Verify teacher has permission to edit
3. Check if assignment is locked/signed
4. Review audit logs for failed attempts

### "Can't exit View As mode"
1. Clear browser cache
2. Manually navigate to `/admin`
3. Re-login as admin if needed
4. Check browser console for errors

---

## 📊 Monitoring

### Key Metrics to Watch

**Performance:**
- Template edit response time
- Assignment creation time
- Version history size (cleanup if > 50 versions)

**Usage:**
- Number of concurrent teachers
- Impersonation frequency (should be occasional)
- Version creation rate

**Security:**
- Failed impersonation attempts
- Unusual audit log patterns
- Multiple impersonations by same admin

---

## 🔄 Future Enhancements (Ideas)

Potential improvements for future versions:

- [ ] UI to view version history in admin panel
- [ ] Ability to manually upgrade assignment to latest version
- [ ] Comparison view between versions
- [ ] Version notes/changelog in UI
- [ ] Notification when template is updated
- [ ] Ability to rollback to previous version
- [ ] Bulk version upgrade tool
- [ ] Version analytics dashboard

---

## 📚 Additional Resources

- **Full Implementation Guide**: `CONCURRENT_USAGE_GUIDE.md`
- **Audit Logs**: Available in Admin Dashboard
- **Migration Script**: `server/src/migrate-add-versioning.ts`

---

## ✅ Checklist for Deployment

- [ ] Pull latest code
- [ ] Install dependencies: `npm install` (both client & server)
- [ ] Build client: `cd nvcar/client && npm run build`
- [ ] Build server: `cd nvcar/server && npm run build`
- [ ] Run migration: `npm run migrate` (in server directory)
- [ ] Restart server
- [ ] Test "View As" feature
- [ ] Create test template and edit it
- [ ] Verify version history
- [ ] Check audit logs
- [ ] Test with multiple users

---

## 🎉 Summary

Your gradebook system now has:

✅ **Admin "View As" Mode** - Debug exactly what teachers see
✅ **Template Versioning** - Automatic protection of in-progress work
✅ **Concurrent Usage** - Multiple teachers work safely together
✅ **Complete Audit Trail** - Track all changes and actions
✅ **Data Integrity** - No data loss or corruption
✅ **Production Ready** - Safe for real-world use

**Questions?** Check the troubleshooting section or review the audit logs!
