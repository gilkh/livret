# Quick Start Guide - Microsoft OAuth Setup

## 🚀 What's Been Implemented

I've added Microsoft/Outlook authentication to your application! Here's what's new:

### ✅ Features Added:

1. **Admin Panel for Microsoft Users** (`/admin/ressource`)
   - Scroll to the bottom to see the new "Utilisateurs Microsoft Outlook" section
   - Add authorized email addresses with roles (Admin/Sub-Admin/Teacher)
   - View last login times
   - Update roles or remove users

2. **Microsoft Sign-In Button** (Login page)
   - New "Se connecter avec Microsoft" button with Microsoft logo
   - Seamless OAuth flow
   - Only authorized emails can access

3. **Complete Backend Infrastructure**
   - OAuth routes for Microsoft authentication
   - Database model for authorized users
   - Audit logging for all Microsoft logins
   - Role-based access control

---

## 📋 Setup Steps (5 minutes)

### Step 1: Create Azure Application

1. Visit: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
2. Click **"New registration"**
3. Fill in:
   - Name: `NVCAR Livret`
   - Account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Web → `http://localhost:5173`
4. Click **Register**

### Step 2: Get Your Credentials

1. Copy the **Application (client) ID** from the overview page
2. Go to **"Certificates & secrets"** → **"New client secret"**
3. Add a description, choose expiry (24 months recommended)
4. **Copy the secret VALUE immediately** (you can't see it again!)

### Step 3: Configure Your .env File

Create or update `nvcar/server/.env`:

```env
# Your existing settings...
MONGODB_URI=mongodb://localhost:27017/nvcar
JWT_SECRET=your-secret-key-here

# Add these new lines:
MICROSOFT_CLIENT_ID=paste-your-client-id-here
MICROSOFT_CLIENT_SECRET=paste-your-secret-here
MICROSOFT_REDIRECT_URI=http://localhost:5173
MICROSOFT_TENANT=common
```

### Step 4: Restart Your Server

```powershell
# Stop your current server (Ctrl+C)
# Then restart it
cd nvcar/server
npm run dev
```

### Step 5: Authorize Users

1. Log in as admin
2. Go to **Admin → Ressources** 
3. Scroll to the bottom
4. Add email addresses (e.g., `user@outlook.com`) with roles
5. Done!

---

## 🎯 How to Use

### For Admins:
1. Go to `/admin/ressource`
2. Find "Utilisateurs Microsoft Outlook" section at the bottom
3. Add authorized emails with their roles
4. Users can now log in with Microsoft

### For Users:
1. Go to login page
2. Click "Se connecter avec Microsoft"
3. Sign in with Microsoft/Outlook account
4. If your email is authorized, you're in!

---

## 🔐 Security Features

- ✅ Only pre-authorized emails can access (whitelist approach)
- ✅ JWT tokens with 2-hour expiry
- ✅ All logins tracked in audit logs
- ✅ Role-based access control
- ✅ Secure OAuth 2.0 flow

---

## 📁 Files Created/Modified

### New Files:
- `server/src/models/OutlookUser.ts` - Database model
- `server/src/routes/outlookUsers.ts` - Admin management API
- `server/src/routes/microsoft.ts` - OAuth flow handler
- `.env.example` - Environment template
- `MICROSOFT_OAUTH_SETUP.md` - Detailed documentation

### Modified Files:
- `client/src/pages/AdminResources.tsx` - Added UI for managing users
- `client/src/pages/Login.tsx` - Added Microsoft sign-in button
- `server/src/app.ts` - Registered new routes
- `server/src/utils/auditLogger.ts` - Support for OAuth users

---

## 🆘 Troubleshooting

### "Microsoft OAuth not configured" error
→ Check `.env` file has `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`
→ Restart the server

### "Email not authorized" error  
→ Add the email in Admin → Ressources → Utilisateurs Microsoft Outlook

### Redirect URI mismatch
→ Make sure Azure redirect URI matches: `http://localhost:5173`

---

## 📚 More Details

See `MICROSOFT_OAUTH_SETUP.md` for:
- Production deployment guide
- API documentation
- Database schema details
- Security best practices

---

## ✨ What Happens When a User Signs In with Microsoft?

1. User clicks "Se connecter avec Microsoft"
2. Redirected to Microsoft login
3. User signs in with their Microsoft/Outlook account
4. Microsoft redirects back with authorization code
5. Server exchanges code for user info
6. Server checks if email is authorized
7. If yes: Creates JWT token and logs them in
8. User sees their dashboard based on their role

**That's it! Microsoft authentication is now fully integrated!** 🎉
