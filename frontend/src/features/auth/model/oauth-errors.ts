export const OAUTH_ERRORS: Record<string, string> = {
  google_disabled: 'Google sign-in is not configured on this server.',
  oauth_state: 'The sign-in link expired, please try again.',
  oauth_failed: 'Google sign-in failed, please try again.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  email_unverified: 'Google has not verified this email, so it cannot be used to sign in.',
  account_conflict: 'This email is already linked to another Google account.',
};
