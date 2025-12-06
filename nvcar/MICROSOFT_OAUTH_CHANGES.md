# Microsoft OAuth Configuration Changes

## Overview
To support accessing the application from different network addresses (local IP, specific network IP, and localhost with HTTPS), the Microsoft OAuth implementation was updated to support dynamic Redirect URIs.

## Changes Made

### 1. Server-Side (`server/src/routes/microsoft.ts`)

*   **Allowed Redirect URIs List**: Created a whitelist of allowed redirect URIs.
    ```typescript
    const ALLOWED_REDIRECT_URIS = [
      DEFAULT_REDIRECT_URI,          // from .env (http://localhost:5173)
      'https://192.168.1.74:5173',   // New local IP
      'https://192.168.17.10:5173',  // Existing network IP
      'https://localhost:5173'       // Localhost with HTTPS
    ]
    ```

*   **Dynamic Auth URL**: Updated the `/auth-url` endpoint to accept a `redirect_uri` query parameter.
    *   It checks if the provided URI is in the `ALLOWED_REDIRECT_URIS` list.
    *   If valid, it uses that URI for the Microsoft login link.
    *   If invalid or missing, it falls back to the default URI from the `.env` file.

*   **Dynamic Callback Handling**: Updated the `/callback` endpoint to accept a `redirect_uri` in the request body.
    *   This ensures the token exchange uses the exact same URI that was used to initiate the login (a requirement of the OAuth 2.0 protocol).

### 2. Client-Side (`client/src/pages/Login.tsx` & `client/src/pages/AdminLogin.tsx`)

*   **Login Request**: When the user clicks "Login with Microsoft", the client now sends the current origin (e.g., `https://192.168.1.74:5173`) to the server:
    ```typescript
    const redirectUri = window.location.origin
    const r = await api.get(`/microsoft/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`)
    ```

*   **Callback Handling**: When Microsoft redirects back to the app with a code, the client sends the origin again during the token exchange:
    ```typescript
    const redirectUri = window.location.origin
    const r = await api.post('/microsoft/callback', { code, redirect_uri: redirectUri })
    ```

## Required Action
**You must update the Azure Portal:**
1.  Go to the Microsoft Azure Portal > App Registrations > Your App > Authentication.
2.  Under **Redirect URIs**, ensure all the following are added:
    *   `http://localhost:5173`
    *   `https://192.168.1.74:5173`
    *   `https://192.168.17.10:5173`
    *   `https://localhost:5173`
