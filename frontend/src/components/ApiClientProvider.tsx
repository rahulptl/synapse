/**
 * API Client Provider Component
 * Sets up the API client with authentication data from the useAuth hook
 */

import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/apiClient';

interface ApiClientProviderProps {
  children: React.ReactNode;
}

export function ApiClientProvider({ children }: ApiClientProviderProps) {
  const { getAuthData } = useAuth();

  useEffect(() => {
    console.log('[API_CLIENT_PROVIDER] Setting up API client with auth data getter');

    // Set up the API client to get auth data automatically
    apiClient.setAuthDataGetter(getAuthData);

    console.log('[API_CLIENT_PROVIDER] API client setup complete');
  }, [getAuthData]);

  return <>{children}</>;
}