import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GramoBaseAuth } from '../src/auth/GramoBaseAuth.js';

describe('GramoBaseAuth', () => {
  let mockUsersList: any[] = [];
  let mockUsersCollection: any;
  let auth: GramoBaseAuth;

  beforeEach(() => {
    mockUsersList = [];
    mockUsersCollection = {
      findOne: vi.fn(async (filter: any) => {
        const email = filter?.email?.$eq;
        return mockUsersList.find((u) => u.email === email) || null;
      }),
      insertOne: vi.fn(async (data: any) => {
        const newUser = {
          _id: `user-${mockUsersList.length + 1}`,
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
          ...data,
        };
        mockUsersList.push(newUser);
        return newUser;
      }),
      findById: vi.fn(async (id: string) => {
        return mockUsersList.find((u) => u._id === id) || null;
      }),
      findByIdAndUpdate: vi.fn(async (id: string, update: any) => {
        const user = mockUsersList.find((u) => u._id === id);
        if (user && update.$set) {
          Object.assign(user, update.$set);
        }
        return user;
      }),
      deleteById: vi.fn(async (id: string) => {
        mockUsersList = mockUsersList.filter((u) => u._id !== id);
        return true;
      }),
    };

    auth = new GramoBaseAuth(mockUsersCollection as any, {
      jwtSecret: 'testsecret12345678901234567890123456789012',
      bcryptRounds: 4, // use fewer rounds for speed in tests
    });
  });

  it('should successfully register a user and generate session', async () => {
    const { user, session } = await auth.register('test@example.com', 'strongpassword123', ['user']);
    expect(user.email).toBe('test@example.com');
    expect(session.userId).toBe(user._id);
    expect(session.roles).toEqual(['user']);
    expect(session.token).toBeDefined();

    expect(mockUsersCollection.insertOne).toHaveBeenCalledTimes(1);
  });

  it('should reject registration if email is registered', async () => {
    await auth.register('test@example.com', 'strongpassword123', ['user']);

    await expect(
      auth.register('test@example.com', 'strongpassword123', ['user'])
    ).rejects.toThrow('[Auth] Email already registered');
  });

  it('should reject weak passwords', async () => {
    await expect(
      auth.register('test@example.com', 'weak', ['user'])
    ).rejects.toThrow('[Auth] Password must be at least 8 characters long');
  });

  it('should login successfully with correct credentials', async () => {
    await auth.register('test@example.com', 'strongpassword123', ['user']);
    const { user, session } = await auth.login('test@example.com', 'strongpassword123');

    expect(user.email).toBe('test@example.com');
    expect(session.token).toBeDefined();
  });

  it('should reject login with wrong password', async () => {
    await auth.register('test@example.com', 'strongpassword123', ['user']);

    await expect(
      auth.login('test@example.com', 'wrongpassword')
    ).rejects.toThrow('[Auth] Invalid credentials');
  });

  it('should verify generated tokens correctly', async () => {
    const { session } = await auth.register('test@example.com', 'strongpassword123', ['user']);
    const verified = auth.verifyToken(session.token);

    expect(verified.userId).toBe(session.userId);
    expect(verified.roles).toEqual(['user']);
  });

  it('should handle role checks', async () => {
    const { session } = await auth.register('test@example.com', 'strongpassword123', ['user', 'moderator']);

    expect(() => auth.requireRole(session, 'user')).not.toThrow();
    expect(() => auth.requireRole(session, 'moderator')).not.toThrow();
    expect(() => auth.requireRole(session, 'admin')).toThrow();

    expect(() => auth.requireAnyRole(session, ['admin', 'moderator'])).not.toThrow();
    expect(() => auth.requireAnyRole(session, ['admin', 'superadmin'])).toThrow();
  });

  it('should change password with old verification', async () => {
    const { user } = await auth.register('test@example.com', 'strongpassword123', ['user']);
    await auth.changePassword(user._id, 'strongpassword123', 'newstrongpassword123');

    const { session } = await auth.login('test@example.com', 'newstrongpassword123');
    expect(session).toBeDefined();
  });

  it('should expose Express-compatible middleware', async () => {
    const { session } = await auth.register('test@example.com', 'strongpassword123', ['user']);
    const req = {
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    } as any;
    const res = {} as any;
    const next = vi.fn();

    auth.middleware()(req, res, next);
    expect(req.session).toBeDefined();
    expect(req.session.userId).toBe(session.userId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
