# Microsoft/Outlook Authentication Setup Guide

This guide explains how to set up Microsoft OAuth authentication for your application.

## Features Implemented

1. **Admin Management Panel** (`/admin/ressources`)
   - Add/remove authorized Microsoft/Outlook email addresses
   - Assign roles (Admin, Sub-Admin, Teacher) to each email
   - View last login times for Microsoft users

2. **Login with Microsoft**
   - Users can click "Sign in with Microsoft" button on login page
   - Redirects to Microsoft authentication
   - Only authorized emails can log in
   - Automatic role assignment based on admin configuration

3. **Audit Logging**
   - All Microsoft logins are logged
   - Admin actions (adding/removing users) are tracked

## Setup Instructions

### Step 1: Create Azure Application

1. Go to [Azure Portal - App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

2. Click **"New registration"**

3. Fill in the details:
   - **Name**: `NVCAR Livret` (or any name you prefer)
   - **Supported account types**: Select "Accounts in any organizational directory and personal Microsoft accounts (Personal Microsoft accounts - e.g. Skype, Xbox)"
   - **Redirect URI**: 
     - Type: `Web`
     - URL: `http://localhost:5173` (for development)
     - For production: `https://yourdomain.com`

4. Click **"Register"**

### Step 2: Get Credentials

1. After registration, you'll see the **Application (client) ID** on the overview page
   - Copy this ID

2. Go to **"Certificates & secrets"** in the left menu

3. Click **"New client secret"**
   - Description: `NVCAR Secret`
   - Expires: Choose your preference (24 months recommended)
   - Click **"Add"**

4. **IMPORTANT**: Copy the secret **Value** immediately (you won't be able to see it again)

### Step 3: Configure Backend Environment

1. Create a `.env` file in the `nvcar/server` directory (copy from `.env.example`)

2. Add your Microsoft credentials:
```env
MICROSOFT_CLIENT_ID=your-application-client-id-here
MICROSOFT_CLIENT_SECRET=your-client-secret-here
MICROSOFT_REDIRECT_URI=http://localhost:5173
MICROSOFT_TENANT=common
```

**Important Notes:**
- `MICROSOFT_TENANT=common` allows any Microsoft account (personal or organizational)
- For production, change `MICROSOFT_REDIRECT_URI` to your production domain
- Keep your `CLIENT_SECRET` secure and never commit it to Git

### Step 4: Update Azure Redirect URIs (for Production)

When deploying to production:

1. Go back to your Azure app registration
2. Click **"Authentication"** in the left menu
3. Under **"Web" Redirect URIs**, add your production URL:
   - Example: `https://yourdomain.com`
4. Click **"Save"**

### Step 5: Authorize Users

1. Start your application
2. Log in as admin (username: `admin`, password: `admin`)
3. Go to **Admin → Ressources** (`/admin/ressource`)
4. Scroll to the bottom - you'll see **"Utilisateurs Microsoft Outlook"** section
5. Add authorized email addresses with their roles:
   - Email: The Microsoft/Outlook email address
   - Display Name: Optional friendly name
   - Role: Admin, Sub-Admin, or Teacher

### Step 6: Test Login

1. Log out of the application
2. On the login page, click **"Se connecter avec Microsoft"**
3. You'll be redirected to Microsoft login
4. Sign in with an authorized email address
5. You'll be redirected back and logged in automatically

## Security Notes

- ✅ Only pre-authorized emails can log in (configured in admin panel)
- ✅ JWT tokens are used for session management (2-hour expiry)
- ✅ All login attempts are logged in the audit system
- ✅ Client secret is stored securely in environment variables
- ✅ HTTPS should be used in production

## Troubleshooting

### "Microsoft OAuth not configured" error
- Check that `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are set in your `.env` file
- Restart the server after changing environment variables

### "Email not authorized" error
- The user's email must be added in the admin panel first
- Check that the email matches exactly (case-insensitive)

### Redirect URI mismatch
- The redirect URI in Azure must match `MICROSOFT_REDIRECT_URI` in your `.env` file
- In Azure, go to Authentication → Web → Redirect URIs and verify

### Token validation fails
- Make sure your `JWT_SECRET` is set in the `.env` file
- Check server logs for detailed error messages

## API Endpoints

### Microsoft OAuth Routes
- `GET /microsoft/auth-url` - Get Microsoft authorization URL
- `POST /microsoft/callback` - Handle OAuth callback with code

### Outlook User Management Routes (Admin only)
- `GET /outlook-users` - List all authorized users
- `POST /outlook-users` - Add new authorized user
- `PATCH /outlook-users/:id` - Update user role
- `DELETE /outlook-users/:id` - Remove user

## Database Schema

### OutlookUser Collection
```typescript
{
  email: string          // Microsoft email (unique, lowercase)
  role: string          // 'ADMIN' | 'SUBADMIN' | 'TEACHER'
  displayName?: string  // Optional display name
  createdAt: Date       // When user was authorized
  lastLogin?: Date      // Last successful login
}
```

## Support

For issues or questions:
1. Check server console logs for errors
2. Verify Azure app configuration
3. Ensure environment variables are set correctly
4. Check that the user email is authorized in admin panel
