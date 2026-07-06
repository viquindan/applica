import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// Lemon Squeezy webhook secret from env
// const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-signature') ?? '';

    // Verify signature (TODO: uncomment when secret is available)
    /*
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (!crypto.timingSafeEqual(digest, signatureBuffer)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    */

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta.event_name;
    const customData = payload.meta.custom_data;

    if (!customData?.user_id) {
      return NextResponse.json({ error: 'Missing user_id in custom_data' }, { status: 400 });
    }

    const userId = customData.user_id;

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const attributes = payload.data.attributes;

      // Update the user to PRO
      await db.update(users).set({
        subscriptionTier: 'pro',
        lemonSqueezyCustomerId: attributes.customer_id.toString(),
        lemonSqueezySubscriptionId: payload.data.id.toString(),
      }).where(eq(users.id, userId));

      console.log(`[Webhook] User ${userId} upgraded to PRO via Lemon Squeezy.`);
    }

    if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      // Downgrade the user to FREE
      await db.update(users).set({
        subscriptionTier: 'free',
      }).where(eq(users.id, userId));

      console.log(`[Webhook] User ${userId} downgraded to FREE.`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[LemonSqueezy Webhook Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
