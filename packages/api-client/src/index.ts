import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@bocardo/api';

export type { AppRouter };

export interface CreateApiClientOptions {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null> | string | null;
}

/**
 * Creates a strongly typed tRPC client instance for Expo Mobile & Web applications.
 */
export function createApiClient(options: CreateApiClientOptions): ReturnType<typeof createTRPCProxyClient<AppRouter>> {
  const client = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${options.baseUrl}/trpc`,
        async headers() {
          const token = options.getAuthToken ? await options.getAuthToken() : null;
          return {
            authorization: token ? `Bearer ${token}` : '',
          };
        },
      }),
    ],
  });

  return client;
}
