import { createTRPCProxyClient } from '@trpc/client';
export { AppRouter } from '@bocardo/api';

interface CreateApiClientOptions {
    baseUrl: string;
    getAuthToken?: () => Promise<string | null> | string | null;
}
/**
 * Creates a strongly typed tRPC client instance for Expo Mobile & Web applications.
 */
declare function createApiClient(options: CreateApiClientOptions): ReturnType<typeof createTRPCProxyClient<AppRouter>>;

export { type CreateApiClientOptions, createApiClient };
