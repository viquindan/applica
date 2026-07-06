import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import LinkedIn from 'next-auth/providers/linkedin';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// "Sign in with LinkedIn" (OIDC) - quick login only, NOT the automation session.
// Registered only when credentials are configured, so the app is unaffected
// without them. Needs AUTH_LINKEDIN_ID / AUTH_LINKEDIN_SECRET from a LinkedIn
// Developer App (scope: openid profile email).
const oauthProviders: NextAuthConfig['providers'] = [];
if (process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET) {
  oauthProviders.push(LinkedIn({
    clientId: process.env.AUTH_LINKEDIN_ID,
    clientSecret: process.env.AUTH_LINKEDIN_SECRET,
  }));
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    ...oauthProviders,
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          onboardingCompleted: user.onboardingCompleted,
        };
      },
    }),
  ],
  callbacks: {
    // For LinkedIn OAuth (no DB adapter), make sure a row exists in our users
    // table so the rest of the app keys off our own user id.
    async signIn({ user, account }) {
      if (account?.provider !== 'linkedin') return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!existing) {
        const randomPass = await bcrypt.hash(randomUUID(), 10);
        await db.insert(users).values({ email, name: user.name ?? email.split('@')[0], password: randomPass });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && (user as any).role) {
        // Credentials path: the authorize() result already has our fields.
        token.id = user.id;
        token.role = (user as any).role;
        token.onboardingCompleted = (user as any).onboardingCompleted;
      }
      if (account?.provider === 'linkedin' && token.email) {
        // OAuth path: resolve our DB user by email.
        const [u] = await db.select().from(users).where(eq(users.email, String(token.email).toLowerCase())).limit(1);
        if (u) {
          token.id = u.id;
          token.role = u.role;
          token.onboardingCompleted = u.onboardingCompleted;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).onboardingCompleted = token.onboardingCompleted;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: { strategy: 'jwt' },
});
