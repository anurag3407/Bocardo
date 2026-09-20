import { appRouter } from '../../apps/api/src/routers/_app';
import { UserRole } from '../../packages/shared-types/src';

export interface TestUser {
  id: string;
  clerkId: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: UserRole;
  isSuspended: boolean;
  restaurantId?: string | null;
}

export const IDS = {
  customer: '11111111-1111-4111-8111-111111111111',
  restaurantOwner: '22222222-2222-4222-8222-222222222222',
  restaurant: '99999999-9999-4999-8999-999999999999',
  rider: '33333333-3333-4333-8333-333333333333',
  admin: '44444444-4444-4444-8444-444444444444',
  order: '55555555-5555-4555-8555-555555555555',
  dishA: '66666666-6666-4666-8666-666666666666',
  dishB: '77777777-7777-4777-8777-777777777777',
  settlement: '88888888-8888-4888-8888-888888888888',
} as const;

export function makeUser(role: UserRole, overrides: Partial<TestUser> = {}): TestUser {
  const base: Record<UserRole, TestUser> = {
    [UserRole.CUSTOMER]: {
      id: IDS.customer,
      clerkId: 'clerk_customer_test',
      email: 'customer@bocardo.in',
      phone: '+919876543210',
      fullName: 'Test Customer',
      role,
      isSuspended: false,
    },
    [UserRole.RESTAURANT]: {
      id: IDS.restaurantOwner,
      clerkId: 'clerk_restaurant_test',
      email: 'partner@bocardo.in',
      phone: '+919876500002',
      fullName: 'Test Kitchen',
      role,
      isSuspended: false,
      restaurantId: IDS.restaurant,
    },
    [UserRole.RIDER]: {
      id: IDS.rider,
      clerkId: 'clerk_rider_test',
      email: 'rider@bocardo.in',
      phone: '+919876500003',
      fullName: 'Test Rider',
      role,
      isSuspended: false,
    },
    [UserRole.ADMIN]: {
      id: IDS.admin,
      clerkId: 'clerk_admin_test',
      email: 'admin@bocardo.in',
      phone: '+919876500001',
      fullName: 'Test Admin',
      role,
      isSuspended: false,
    },
  };
  return { ...base[role], ...overrides };
}

/** Creates a tRPC caller with an arbitrary authenticated (or anonymous) context. */
export function makeCaller(user: TestUser | null) {
  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: user as any,
  });
}

export const callers = {
  customer: (overrides: Partial<TestUser> = {}) =>
    makeCaller(makeUser(UserRole.CUSTOMER, overrides)),
  restaurant: (overrides: Partial<TestUser> = {}) =>
    makeCaller(makeUser(UserRole.RESTAURANT, overrides)),
  rider: (overrides: Partial<TestUser> = {}) => makeCaller(makeUser(UserRole.RIDER, overrides)),
  admin: (overrides: Partial<TestUser> = {}) => makeCaller(makeUser(UserRole.ADMIN, overrides)),
  anonymous: () => makeCaller(null),
};
