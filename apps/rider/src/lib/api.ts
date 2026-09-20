import { createApiClient } from '@bocardo/api-client';

const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const trpc = createApiClient({
  baseUrl,
  getAuthToken: () => 'mock_token_rider_user',
});

export const API_URL = baseUrl;
