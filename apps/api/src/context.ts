import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { db } from '@bocardo/database';
import { UserRole } from '@bocardo/shared-types';

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: UserRole;
  isSuspended: boolean;
  restaurantId?: string | null;
}

export interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  user: AuthUser | null;
}

export async function createContext({
  req,
  res,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}): Promise<Context> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { req, res, user: null };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { req, res, user: null };
  }

  return { req, res, user: await authenticateToken(token) };
}

export async function authenticateToken(token: string): Promise<AuthUser | null> {
  try {
    let clerkId = '';
    let email = null;
    let phone = null;
    let role = UserRole.CUSTOMER;
    let fullName = null;

    // Decode Clerk Token (with mock fallback for dev/demo)
    if (process.env.ALLOW_MOCK_AUTH === 'true' && token.startsWith('mock_token_')) {
      const parts = token.split('_');
      role = (parts[2]?.toUpperCase() as UserRole) || UserRole.CUSTOMER;
      clerkId = `clerk_${role.toLowerCase()}_demo`;
      email = `${role.toLowerCase()}@bocardo.in`;
      fullName = `Demo ${role}`;
    } else {
      const publicKey = process.env.CLERK_JWT_KEY?.replace(/\\n/g, '\n');
      const issuer = process.env.CLERK_ISSUER;
      const audience = process.env.CLERK_AUDIENCE;
      if (!publicKey || !issuer || !audience) return null;
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'], issuer, audience,
      }) as jwt.JwtPayload;
      if (!decoded || !decoded.sub) {
        return null;
      }
      clerkId = decoded.sub;
      email = decoded.email || null;
      phone = decoded.phone || null;
      fullName = decoded.name || null;
      // SECURITY: never trust client-controllable Clerk metadata for RBAC.
      // Role resolution order: server-managed env allowlist -> DB -> CUSTOMER.
      role = UserRole.CUSTOMER;
    }

    if (!Object.values(UserRole).includes(role)) return null;

    // Atomic Just-In-Time (JIT) Upsert: Guarantees user exists in DB before procedure runs
    const userRes = await db.query(
      `INSERT INTO users (clerk_id, email, phone, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (clerk_id) DO UPDATE SET
         updated_at = NOW(),
         email = COALESCE(EXCLUDED.email, users.email),
         phone = COALESCE(EXCLUDED.phone, users.phone),
         full_name = COALESCE(EXCLUDED.full_name, users.full_name)
       RETURNING id, clerk_id as "clerkId", email, phone, full_name as "fullName", role, is_suspended as "isSuspended"`,
      [clerkId, email, phone, fullName, role]
    );

    const user = userRes.rows[0];

    // Server-managed privilege grants (staff onboarding is out-of-band):
    // PRIVILEGED_ROLES="admin@bocardo.in:ADMIN,rider@bocardo.in:RIDER"
    const grants = (process.env.PRIVILEGED_ROLES || '')
      .split(',')
      .map((entry) => entry.trim().split(':'))
      .filter(([e, r]) => e && r && Object.values(UserRole).includes(r as UserRole));
    const grant = grants.find(([e]) => email && e.toLowerCase() === email.toLowerCase());
    if (grant) {
      role = grant[1] as UserRole;
      if (user.role !== role) {
        await db.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, user.id]);
        user.role = role;
      }
    } else if (user.role && user.role !== role) {
      // DB is source of truth for previously-granted roles (e.g. restaurant owner set by admin)
      role = user.role;
    }

    // If restaurant partner, fetch associated restaurant_id
    let restaurantId: string | null = null;
    if (user.role === UserRole.RESTAURANT) {
      const restRes = await db.query(
        'SELECT id FROM restaurants WHERE owner_id = $1 LIMIT 1',
        [user.id]
      );
      restaurantId = restRes.rows[0]?.id || null;
    }

    if (user.isSuspended) return null;
    return { ...user, restaurantId };
  } catch (error) {
    console.error('[Context Auth Verification Error]', error);
    return null;
  }
}
