/**
 * Auto-Login Configuration
 * Automatically logs in with praa@G.com on app load
 */

// Demo Account Configuration (praa@G.com - Cafe XYZ Business)
export const AUTO_LOGIN_CONFIG = {
  enabled: true, // Set to false to disable auto-login
  email: 'praa@G.com',
  password: 'A12345678',
  businessName: 'Cafe XYZ',
  autoLoginOnLoad: true, // Auto-login when app loads
  skipIfUserExists: true, // Don't override if user already logged in
};

/**
 * Attempt auto-login with demo credentials
 * @param {function} dispatch Redux dispatch function
 * @param {function} apiCall API call function
 * @returns {Promise<{success: boolean, token: string, user: object}>}
 */
export async function attemptAutoLogin(dispatch, apiCall) {
  try {
    if (!AUTO_LOGIN_CONFIG.enabled) {
      return { success: false, reason: 'Auto-login disabled' };
    }

    // Check if user already logged in
    const existingToken = localStorage.getItem('token');
    const existingUser = localStorage.getItem('user');
    
    if (AUTO_LOGIN_CONFIG.skipIfUserExists && existingToken && existingUser) {
      try {
        const user = JSON.parse(existingUser);
        return { 
          success: true, 
          reason: 'Already logged in',
          token: existingToken,
          user
        };
      } catch (e) {
        // Invalid stored data, proceed with auto-login
      }
    }

    console.log('[Auto-Login] Attempting to login with praa@G.com...');

    // Call login API
    const response = await apiCall.post('/api/auth/login', {
      email: AUTO_LOGIN_CONFIG.email,
      password: AUTO_LOGIN_CONFIG.password,
    });

    if (response.data?.success && response.data?.token) {
      const { token, user } = response.data;
      
      // Store in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // Dispatch to Redux
      if (dispatch) {
        dispatch({ type: 'SET_USER', payload: user });
      }

      console.log(`[Auto-Login] ✓ Successfully logged in as ${AUTO_LOGIN_CONFIG.email}`);
      return { 
        success: true, 
        token, 
        user,
        reason: 'Auto-login successful'
      };
    } else {
      throw new Error('Invalid login response');
    }
  } catch (error) {
    console.warn(`[Auto-Login] ⚠ Auto-login failed:`, error.message);
    return { 
      success: false, 
      reason: error.message,
      error
    };
  }
}

/**
 * Get auto-login credentials (for debugging)
 */
export function getAutoLoginCredentials() {
  return {
    email: AUTO_LOGIN_CONFIG.email,
    password: AUTO_LOGIN_CONFIG.password,
    enabled: AUTO_LOGIN_CONFIG.enabled,
  };
}
