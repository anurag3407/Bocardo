import { initTRPC, TRPCError } from '@trpc/server';
import { Context, AuthUser } from './context';
import { UserRole } from '@bocardo/shared-types';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource.',
    });
  }

  if (ctx.user.isSuspended) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your account has been suspended. Please contact platform support.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

export const roleProtectedProcedure = (...allowedRoles: UserRole[]) =>
  protectedProcedure.use(
    middleware(async ({ ctx, next }) => {
      const user = ctx.user as AuthUser;
      if (!allowedRoles.includes(user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of: ${allowedRoles.join(', ')}`,
        });
      }
      return next({
        ctx: {
          ...ctx,
          user,
        },
      });
    })
  );
