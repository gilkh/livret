# Quick Reference Card

## 🚀 30-Second Overview

### What's New?
1. **"Login As" Mode**: Admin opens user's full dashboard in new tab
2. **Template Versioning**: Auto-protects data when templates edited
3. **Concurrent Safety**: Many teachers work together safely
4. **Username Display**: All users see their name in top-right navbar

---

## ⚡ Quick Commands

### Deploy
```powershell
cd nvcar\server
npm install
npm run migrate    # ← IMPORTANT!
npm run dev
```

### Test
```powershell
# Login as admin → Users → Click "View As" → See orange banner
```

---

## 🎯 3 Key Features

### 1. Login As (Full Account Access)
```
Users Page → [🚪 Login As] → New tab opens → Full dashboard → [Exit & Close Tab]
```
**Use When**: Need to see user's complete experience
**Features**: 
- Opens in new tab (admin tab stays open)
- Full account access, not just templates
- See their dashboard, classes, students, everything
- Username shows in top-right navbar

### 2. Versioning (Data Protection)
```
Edit template → Auto creates v2 → Old assignments stay on v1
```
**Use When**: Need to update template in use

### 3. Concurrent (Multi-User)
```
50 teachers editing → All safe → No conflicts
```
**Use When**: Always! It's automatic.

---

## 🔍 How to Check It Works

### Impersonation
✓ Orange banner shows (two lines)
✓ New tab opened
✓ User's name in navbar (top-right)
✓ Audit log has START_IMPERSONATION
✓ Exit button closes tab

### Versioning
✓ Template has currentVersion: 2
✓ Assignment has templateVersion: 1
✓ versionHistory array has 2 items

### Concurrent
✓ Multiple teachers editing
✓ All saves succeed
✓ No database errors

---

## 🐛 Common Issues

### "Login As" button missing
→ Check user role (only for TEACHER/SUBADMIN)

### Username not showing
→ Check localStorage has 'displayName'

### Version not created
→ Need active assignments + significant change

### Migration fails
→ Check MongoDB connection

---

## 📞 Quick Help

| Issue | Solution |
|-------|----------|
| Can't see template | Use "View As" to debug |
| Template wrong version | Check templateVersion field |
| Concurrent errors | None expected - it's safe! |
| Migration needed | Run `npm run migrate` |

---

## 📚 Full Docs

- **NEW_FEATURES_README.md** - Complete guide
- **CONCURRENT_USAGE_GUIDE.md** - Safety details
- **VISUAL_USER_GUIDE.md** - Step-by-step
- **DEPLOYMENT_CHECKLIST.md** - Deploy steps

---

## ✅ Pre-Deployment

- [ ] `npm install` (server & client)
- [ ] `npm run migrate` ← DON'T SKIP!
- [ ] Test "View As"
- [ ] Test versioning
- [ ] Check audit logs

---

## 🎉 Success!

**You now have**:
- Admin debugging tools
- Data protection
- Safe concurrent usage
- Complete audit trail

**Ready for production!** 🚀

---

*Print this card for quick reference*
