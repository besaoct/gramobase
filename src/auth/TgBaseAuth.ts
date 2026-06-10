import { randomUUID, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthConfig, User, Session } from '../types/index.js';
import { Collection } from '../orm/Collection.js';
import { existsSync, readFileSync } from 'fs';

const UserSchema = z.object({
  email: z.string().email(),
  passwordHash: z.string(),
  roles: z.array(z.string()).default(['user']),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// TODO(security): Consider adding OAuth 2.0 provider support (e.g., Google, GitHub).
// TODO(security): Consider adding MFA (TOTP/WebAuthn) for high-security deployments.
// TODO(security): Consider adding pwned-password checking via haveibeenpwned.com API.

/**
 * Resolve JWT secret with multi-tiered fallback:
 * 1. Explicit config value
 * 2. Environment variable
 * 3. Local jwt_secret.txt file
 * 4. Ephemeral random generation with warning (NOT suitable for multi-instance prod)
 *
 * MUST NOT hardcode or use default literal fallbacks.
 */
function resolveJwtSecret(configSecret?: string): string {
  if (configSecret) return configSecret;
  if (process.env['JWT_SECRET']) return process.env['JWT_SECRET'];
  const secretFile = './jwt_secret.txt';
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf-8').trim();
  const ephemeral = randomBytes(32).toString('hex');
  console.warn(
    '[tgbase Auth] WARNING: No JWT_SECRET provided. Using an ephemeral random secret. ' +
    'Tokens will be invalidated on restart. Set JWT_SECRET env variable for production!'
  );
  return ephemeral;
}

/**
 * Validate password strength (min 8 chars, no maximum).
 * Does not require specific character types — users choose their own strong passwords.
 */
function validatePasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new Error('[Auth] Password must be at least 8 characters long');
  }
  // TODO(security): Consider rejecting known breached passwords via HaveIBeenPwned API.
}

export class TgBaseAuth {
  private readonly DEFAULT_ROUNDS = 12;
  private readonly resolvedSecret: string;

  constructor(
    private users: Collection<typeof UserSchema>,
    private config: AuthConfig
  ) {
    // Resolve secret at construction time; fail safely if no secret available
    this.resolvedSecret = resolveJwtSecret(config.jwtSecret);
  }

  // ─── Registration ─────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
    roles: string[] = ['user'],
    metadata?: Record<string, unknown>
  ): Promise<{ user: User; session: Session }> {
    // Validate email format (basic — Zod schema handles full validation)
    if (!email || typeof email !== 'string') {
      throw new Error('[Auth] Invalid email');
    }

    // Validate password strength
    validatePasswordStrength(password);

    const existing = await this.users.findOne({ email: { $eq: email } } as any);
    if (existing) throw new Error('[Auth] Email already registered');

    const passwordHash = await bcrypt.hash(
      password,
      this.config.bcryptRounds ?? this.DEFAULT_ROUNDS
    );

    const now = new Date().toISOString();
    const doc = await this.users.insertOne({
      email,
      passwordHash,
      roles,
      metadata,
      createdAt: now,
      updatedAt: now,
    });

    const user = doc as unknown as User;
    const session = this.createSession(user);
    await this.config.onSignIn?.(user);

    return { user, session };
  }

  // ─── Login ────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<{ user: User; session: Session }> {
    const doc = await this.users.findOne({ email: { $eq: email } } as any);
    if (!doc) {
      // Use constant-time comparison to avoid timing attacks on email existence
      await bcrypt.compare(password, '$2a$12$invalidhashtopreventtimingattacks');
      throw new Error('[Auth] Invalid credentials');
    }

    const user = doc as unknown as User;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('[Auth] Invalid credentials');

    const session = this.createSession(user);
    await this.config.onSignIn?.(user);

    return { user, session };
  }

  // ─── Token verification ───────────────────────────────────────────────

  verifyToken(token: string): Session {
    try {
      // Hardcode algorithm to prevent algorithm confusion attacks; reject 'none'
      const payload = jwt.verify(token, this.resolvedSecret, {
        algorithms: ['HS256'],
      }) as Session;
      return payload;
    } catch {
      throw new Error('[Auth] Invalid or expired token');
    }
  }

  // ─── Role-based access ────────────────────────────────────────────────

  requireRole(session: Session, role: string): void {
    if (!session.roles.includes(role) && !session.roles.includes('admin')) {
      throw new Error(`[Auth] Requires role: ${role}`);
    }
  }

  requireAnyRole(session: Session, roles: string[]): void {
    const hasRole = roles.some(
      (r) => session.roles.includes(r) || session.roles.includes('admin')
    );
    if (!hasRole) {
      throw new Error(`[Auth] Requires one of roles: ${roles.join(', ')}`);
    }
  }

  // ─── Password management ──────────────────────────────────────────────

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const doc = await this.users.findById(userId);
    if (!doc) throw new Error('[Auth] User not found');

    const user = doc as unknown as User;
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new Error('[Auth] Old password incorrect');

    // Validate new password strength
    validatePasswordStrength(newPassword);

    const newHash = await bcrypt.hash(
      newPassword,
      this.config.bcryptRounds ?? this.DEFAULT_ROUNDS
    );

    await this.users.findByIdAndUpdate(userId, {
      $set: { passwordHash: newHash, updatedAt: new Date().toISOString() } as any,
    });
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    validatePasswordStrength(newPassword);
    const newHash = await bcrypt.hash(
      newPassword,
      this.config.bcryptRounds ?? this.DEFAULT_ROUNDS
    );
    await this.users.findByIdAndUpdate(userId, {
      $set: { passwordHash: newHash, updatedAt: new Date().toISOString() } as any,
    });
  }

  // ─── User management ─────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | null> {
    const doc = await this.users.findById(id);
    return doc ? (doc as unknown as User) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const doc = await this.users.findOne({ email: { $eq: email } } as any);
    return doc ? (doc as unknown as User) : null;
  }

  async updateRoles(userId: string, roles: string[]): Promise<void> {
    await this.users.findByIdAndUpdate(userId, {
      $set: { roles, updatedAt: new Date().toISOString() } as any,
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.users.deleteById(userId);
    await this.config.onSignOut?.(userId);
  }

  // ─── Session helpers ──────────────────────────────────────────────────

  private createSession(user: User): Session {
    const expiresIn = this.config.jwtExpiresIn ?? '7d';
    const payload: Omit<Session, 'token'> & { sub: string } = {
      sub: user._id,
      userId: user._id,
      roles: user.roles,
      expiresAt: Date.now() + this.parseExpiry(expiresIn),
    };

    // Sign with hardcoded HS256 algorithm; 'none' algorithm is never used
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = (jwt.sign as any)(payload, this.resolvedSecret, {
      expiresIn,
      algorithm: 'HS256',
    }) as string;
    return { ...payload, token };
  }

  private parseExpiry(s: string): number {
    const n = parseInt(s);
    if (s.endsWith('d')) return n * 86400_000;
    if (s.endsWith('h')) return n * 3600_000;
    if (s.endsWith('m')) return n * 60_000;
    return n * 1000;
  }

  // ─── Middleware factory (Express/Fastify compatible) ──────────────────

  middleware() {
    return (req: any, res: any, next: any) => {
      const auth = req.headers['authorization'] as string | undefined;
      if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
      }
      try {
        req.session = this.verifyToken(auth.slice(7));
        next();
      } catch {
        // Do NOT expose error details to client; log internally if needed
        res.status(401).json({ error: 'Unauthorized' });
      }
    };
  }

  requireRoleMiddleware(role: string) {
    return (req: any, res: any, next: any) => {
      try {
        this.requireRole(req.session, role);
        next();
      } catch {
        res.status(403).json({ error: 'Forbidden' });
      }
    };
  }
}
