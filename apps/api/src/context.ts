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

  try {
    let clerkId = '';
    let email = null;
    let phone = null;
    let role = UserRole.CUSTOMER;
    let fullName = null;

    // Decode Clerk Token (with local development mock fallback)
    if (token.startsWith('mock_token_')) {
      const parts = token.split('_');
      role = (parts[2]?.toUpperCase() as UserRole) || UserRole.CUSTOMER;
      clerkId = `clerk_${role.toLowerCase()}_demo`;
      email = `${role.toLowerCase()}@bocardo.in`;
      fullName = `Demo ${role}`;
    } else {
      const decoded: any = jwt.decode(token);
      if (!decoded || !decoded.sub) {
        return { req, res, user: null };
      }
      clerkId = decoded.sub;
      email = decoded.email || null;
      phone = decoded.phone || null;
      fullName = decoded.name || null;
      role = decoded.publicMetadata?.role || UserRole.CUSTOMER;
    }

    // Atomic Just-In-Time (JIT) Upsert: Guarantees user exists in DB before procedure runs
    const userRes = await db.query(
      `INSERT INTO users (clerk_id, email, phone, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, clerk_id as "clerkId", email, phone, full_name as "fullName", role, is_suspended as "isSuspended"`,
      [clerkId, email, phone, fullName, role]
    );

    const user = userRes.rows[0];

    // If restaurant partner, fetch associated restaurant_id
    let restaurantId: string | null = null;
    if (user.role === UserRole.RESTAURANT) {
      const restRes = await db.query(
        'SELECT id FROM restaurants WHERE owner_id = $1 LIMIT 1',
        [user.id]
      );
      restaurantId = restRes.rows[0]?.id || null;
    }

    return {
      req,
      res,
      user: {
        ...user,
        restaurantId,
      },
    };
  } catch (error) {
    console.error('[Context Auth Verification Error]', error);
    return { req, res, user: null };
  }
}
