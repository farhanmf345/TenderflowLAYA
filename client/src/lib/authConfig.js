// ============================================================
//  TenderFlow v4.0 - Microsoft Azure AD / MSAL Configuration
//  Set VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID in .env
// ============================================================

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'YOUR_CLIENT_ID',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'common'}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

// Scopes requested on login
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}
