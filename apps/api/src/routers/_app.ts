import { router } from '../trpc';
import { authRouter } from './auth';
import { restaurantRouter } from './restaurant';
import { orderRouter } from './order';
import { recommendationsRouter } from './recommendations';
import { riderRouter } from './rider';
import { settlementRouter } from './settlement';

export const appRouter = router({
  auth: authRouter,
  restaurant: restaurantRouter,
  order: orderRouter,
  recommendations: recommendationsRouter,
  rider: riderRouter,
  settlement: settlementRouter,
});

export type AppRouter = typeof appRouter;
