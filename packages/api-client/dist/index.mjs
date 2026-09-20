// src/index.ts
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
function createApiClient(options) {
  const client = createTRPCProxyClient({
    links: [
      httpBatchLink({
        url: `${options.baseUrl}/trpc`,
        async headers() {
          const token = options.getAuthToken ? await options.getAuthToken() : null;
          return {
            authorization: token ? `Bearer ${token}` : ""
          };
        }
      })
    ]
  });
  return client;
}
export {
  createApiClient
};
