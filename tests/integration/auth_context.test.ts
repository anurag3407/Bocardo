import assert from 'node:assert/strict';
import { authenticateToken, createContext } from '../../apps/api/src/context';
import { UserRole } from '../../packages/shared-types/src';
import { installPlatformDoubles } from '../harness/db';
import { callers, IDS, makeCaller, makeUser } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Clerk Context & RBAC Middleware');

runSuite(suite, async () => {
  let dbUser: any = {
    id: IDS.customer,
    clerkId: 'clerk_customer_demo',
    email: 'customer@bocardo.in',
    phone: '+919876543210',
    fullName: 'Demo CUSTOMER',
    role: UserRole.CUSTOMER,
    isSuspended: false,
  };

  const mockDb = installPlatformDoubles()
    .on(/INSERT INTO users/i, () => ({ rows: [{ ...dbUser }], rowCount: 1 }))
    .on(/UPDATE users SET role = \$1/i, () => ({ rows: [], rowCount: 1 }))
    .on(/SELECT id FROM restaurants WHERE owner_id/i, () => ({
      rows: [{ id: IDS.restaurant }],
      rowCount: 1,
    }));

  const req = (authorization?: string) => ({ headers: { authorization } } as any);
  const res = {} as any;

  await suite.test('missing Authorization header yields an anonymous context', async () => {
    assert.equal((await createContext({ req: req(), res })).user, null);
  });

  await suite.test('non-Bearer and empty schemes are rejected', async () => {
    assert.equal((await createContext({ req: req('Token abc'), res })).user, null);
    assert.equal((await createContext({ req: req('Bearer '), res })).user, null);
    assert.equal((await createContext({ req: req('Bearer    '), res })).user, null);
  });

  await suite.test('JIT upsert resolves the CUSTOMER demo identity', async () => {
    dbUser.role = UserRole.CUSTOMER;
    const user = await authenticateToken('mock_token_customer_abc');
    assert.ok(user);
    assert.equal(user!.role, UserRole.CUSTOMER);
    assert.equal(user!.clerkId, 'clerk_customer_demo');
    assert.equal(user!.email, 'customer@bocardo.in');
    assert.equal(user!.restaurantId, null);
  });

  await suite.test('a RESTAURANT identity also resolves its restaurant', async () => {
    dbUser.role = UserRole.RESTAURANT;
    const user = await authenticateToken('mock_token_restaurant_abc');
    assert.ok(user);
    assert.equal(user!.role, UserRole.RESTAURANT);
    assert.equal(user!.restaurantId, IDS.restaurant);
  });

  await suite.test('unknown roles are rejected before touching the database', async () => {
    assert.equal(await authenticateToken('mock_token_superhero_abc'), null);
  });

  await suite.test('the database role is authoritative over the token hint', async () => {
    dbUser.role = UserRole.CUSTOMER;
    const user = await authenticateToken('mock_token_rider_abc');
    assert.ok(user);
    assert.equal(user!.role, UserRole.CUSTOMER);
  });

  await suite.test('suspended accounts cannot authenticate', async () => {
    dbUser.role = UserRole.RIDER;
    dbUser.isSuspended = true;
    assert.equal(await authenticateToken('mock_token_rider_abc'), null);
    dbUser.isSuspended = false;
  });

  await suite.test('server-managed PRIVILEGED_ROLES grants elevate staff accounts', async () => {
    dbUser.role = UserRole.CUSTOMER;
    process.env.PRIVILEGED_ROLES = 'customer@bocardo.in:ADMIN';
    mockDb.clearLog();
    try {
      const user = await authenticateToken('mock_token_customer_abc');
      assert.ok(user);
      assert.equal(user!.role, UserRole.ADMIN);
      assert.equal(mockDb.calls(/UPDATE users SET role = \$1/i).length, 1);
    } finally {
      delete process.env.PRIVILEGED_ROLES;
    }
  });

  await suite.test('real (non-mock) tokens fail closed without Clerk keys', async () => {
    assert.equal(await authenticateToken('eyJhbGciOiJSUzI1NiJ9.payload.sig'), null);
  });

  await suite.test('public procedures work without a session', async () => {
    const health = await callers.anonymous().auth.health();
    assert.equal(health.status, 'ok');
    assert.ok(health.timestamp);
  });

  await suite.test('protected procedures reject anonymous callers', async () => {
    await expectTrpcError(() => callers.anonymous().auth.me(), 'UNAUTHORIZED');
    await expectTrpcError(() => callers.anonymous().order.listMyOrders(), 'UNAUTHORIZED');
  });

  await suite.test('protected procedures reject suspended callers', async () => {
    const suspended = makeCaller(makeUser(UserRole.CUSTOMER, { isSuspended: true }));
    await expectTrpcError(() => suspended.auth.me(), 'FORBIDDEN');
  });

  await suite.test('auth.me echoes the authenticated user', async () => {
    const user = await callers.admin().auth.me();
    assert.equal(user.role, UserRole.ADMIN);
    assert.equal(user.id, IDS.admin);
  });

  await suite.test('role-protected procedures enforce the allow-list', async () => {
    await expectTrpcError(() => callers.customer().rider.getProfile(), 'FORBIDDEN');
    await expectTrpcError(() => callers.restaurant().rider.getProfile(), 'FORBIDDEN');
    await expectTrpcError(() => callers.customer().settlement.exportBankTransferCsv(), 'FORBIDDEN');
  });
});
