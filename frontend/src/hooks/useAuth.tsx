import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { resolveBackendBaseUrl } from '@/utils/backendUrl';
import { apiClient } from '../services/apiClient';
import { isTokenValid, shouldRefreshToken, getTokenRemainingTime } from '../utils/jwt';
import { setRefreshTokenCallback, clearQueuedRequests } from '../utils/requestInterceptor';

// Cloud SQL Auth User interface
interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url?: string;
  profile_updated_at?: string;  // For avatar cache busting
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  refreshing: boolean;
  isTokenValid: () => boolean;
  getAuthData: () => { accessToken: string; userId: string } | null;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  forceTokenRefresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = resolveBackendBaseUrl();

const DEFAULT_SIGNUP_ERROR = 'Signup failed';

function parseErrorMessage(errorData: unknown, fallback: string = DEFAULT_SIGNUP_ERROR): string {
  if (!errorData) {
    return fallback;
  }

  if (typeof errorData === 'string') {
    return errorData;
  }

  if (Array.isArray(errorData)) {
    const messages = errorData
      .map((item) => parseErrorMessage(item, ''))
      .filter((msg): msg is string => Boolean(msg && msg.trim()));

    return messages[0] ?? fallback;
  }

  if (typeof errorData === 'object') {
    const data = errorData as Record<string, unknown>;

    if (typeof data.msg === 'string' && data.msg.trim().length > 0) {
      return data.msg;
    }

    if (typeof data.message === 'string' && data.message.trim().length > 0) {
      return data.message;
    }

    if (data.detail !== undefined) {
      return parseErrorMessage(data.detail, fallback);
    }
  }

  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      clearQueuedRequests();
    };
  }, []);

  // Setup refresh token callback for request interceptor
  useEffect(() => {
    setRefreshTokenCallback(refreshToken);
  }, []);

  // Start background token refresh monitoring
  useEffect(() => {
    if (accessToken && user) {
      startTokenRefreshMonitoring();
    } else {
      stopTokenRefreshMonitoring();
    }

    return () => {
      stopTokenRefreshMonitoring();
    };
  }, [accessToken, user]);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        setAccessToken(token);
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/cloud-auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
          } else if (response.status === 401) {
            // Try to refresh token
            await refreshToken();
          } else {
            // Clear invalid token
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setAccessToken(null);
          }
        } catch (error) {
          console.error('Failed to load user:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setAccessToken(null);
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  // Start background token refresh monitoring
  const startTokenRefreshMonitoring = () => {
    console.log('[TOKEN_MONITOR] Starting background token refresh monitoring');

    // Clear any existing timer
    stopTokenRefreshMonitoring();

    // Check token every 2 minutes
    refreshTimerRef.current = setInterval(() => {
      if (accessToken && shouldRefreshToken(accessToken, 3)) { // 3 minute buffer
        console.log('[TOKEN_MONITOR] Proactive token refresh triggered');
        refreshToken();
      }
    }, 2 * 60 * 1000); // Every 2 minutes
  };

  // Stop background token refresh monitoring
  const stopTokenRefreshMonitoring = () => {
    console.log('[TOKEN_MONITOR] Stopping background token refresh monitoring');
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  // Check if current token is valid
  const isCurrentTokenValid = (): boolean => {
    if (!accessToken) {
      console.log('[TOKEN_MONITOR] No access token available');
      return false;
    }

    const isValid = isTokenValid(accessToken);
    console.log('[TOKEN_MONITOR] Token validity check:', {
      isValid,
      tokenLength: accessToken.length,
      remainingTime: getTokenRemainingTime(accessToken)
    });

    return isValid;
  };

  // Get auth data for API calls
  const getAuthData = () => {
    if (!accessToken || !user) {
      console.log('[TOKEN_MONITOR] Auth data not available');
      return null;
    }

    return {
      accessToken,
      userId: user.id
    };
  };

  const refreshToken = async () => {
    const refreshTokenValue = localStorage.getItem('refresh_token');
    if (!refreshTokenValue) {
      console.log('[TOKEN_REFRESH] No refresh token available');
      return false;
    }

    // Prevent concurrent refresh attempts
    if (refreshing) {
      console.log('[TOKEN_REFRESH] Refresh already in progress');
      return true; // Assume success if already refreshing
    }

    setRefreshing(true);
    console.log('[TOKEN_REFRESH] Starting token refresh');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/cloud-auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[TOKEN_REFRESH] Token refresh successful', {
          newUserId: data.user?.id,
          hasNewAccessToken: !!data.access_token,
          hasNewRefreshToken: !!data.refresh_token
        });

        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAccessToken(data.access_token);
        setUser(data.user);
        return true;
      } else {
        console.error('[TOKEN_REFRESH] Refresh failed', {
          status: response.status,
          statusText: response.statusText
        });

        // Refresh failed, clear tokens and stop monitoring
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setAccessToken(null);
        setUser(null);
        stopTokenRefreshMonitoring();
        return false;
      }
    } catch (error) {
      console.error('[TOKEN_REFRESH] Network error during refresh:', error);
      return false;
    } finally {
      setRefreshing(false);
      console.log('[TOKEN_REFRESH] Token refresh completed');
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/cloud-auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();

        // Validate response data
        if (!data.access_token || !data.refresh_token || !data.user) {
          console.error('Invalid login response:', data);
          return {
            error: {
              message: 'Invalid response from server. Please try again.'
            }
          };
        }

        // Ensure user object has required fields
        if (!data.user.id || !data.user.email) {
          console.error('Invalid user object:', data.user);
          return {
            error: {
              message: 'Invalid user data received. Please contact support.'
            }
          };
        }

        // Store tokens
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        // Update state
        setAccessToken(data.access_token);
        setUser(data.user);

        console.log('Login successful, user set:', data.user);

        return { error: null };
      } else {
        const errorData = await response.json();
        return {
          error: {
            message: errorData.detail || 'Login failed'
          }
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'Network error'
        }
      };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/cloud-auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Validate response data
        if (!data.access_token || !data.refresh_token || !data.user) {
          console.error('Invalid signup response:', data);
          return {
            error: {
              message: 'Invalid response from server. Please try again.'
            }
          };
        }

        // Ensure user object has required fields
        if (!data.user.id || !data.user.email) {
          console.error('Invalid user object:', data.user);
          return {
            error: {
              message: 'Invalid user data received. Please contact support.'
            }
          };
        }

        // Store tokens
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        // Update state
        setAccessToken(data.access_token);
        setUser(data.user);

        console.log('Signup successful, user set:', data.user);

        return { error: null };
      } else {
        let errorMessage = DEFAULT_SIGNUP_ERROR;

        try {
          const errorData = await response.json();
          errorMessage = parseErrorMessage(errorData, DEFAULT_SIGNUP_ERROR);
        } catch (parseError) {
          console.error('Failed to parse signup error response:', parseError);
        }

        return {
          error: {
            message: errorMessage
          }
        };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'Network error'
        }
      };
    }
  };

  const signOut = async () => {
    console.log('[AUTH] Starting sign out process');
    const refreshTokenValue = localStorage.getItem('refresh_token');

    if (refreshTokenValue) {
      try {
        await fetch(`${API_BASE_URL}/api/v1/cloud-auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshTokenValue }),
        });
        console.log('[AUTH] Successfully logged out from server');
      } catch (error) {
        console.error('[AUTH] Logout error:', error);
      }
    }

    // Stop monitoring and clear queues
    stopTokenRefreshMonitoring();
    clearQueuedRequests();

    // Clear local storage and state
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setAccessToken(null);
    setUser(null);
    setRefreshing(false);

    console.log('[AUTH] Sign out completed');
  };

  const refreshProfile = async () => {
    if (!accessToken || !user) return;

    try {
      const profile = await apiClient.getProfile({
        userId: user.id,
        accessToken,
      });
      setUser({ ...user, ...profile });
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  };

  // Force manual token refresh (useful for testing or manual recovery)
  const forceTokenRefresh = async (): Promise<boolean> => {
    console.log('[AUTH] Manual token refresh triggered');
    return await refreshToken();
  };

  const value = {
    user,
    accessToken,
    loading,
    refreshing,
    isTokenValid: isCurrentTokenValid,
    getAuthData,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    forceTokenRefresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
