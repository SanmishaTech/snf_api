/**
 * PhonePe Payment Service — Direct REST API integration (no SDK)
 *
 * Uses the official PhonePe V2 Standard Checkout API:
 *   Authorization:  POST /v1/oauth/token
 *   Create Payment: POST /checkout/v2/pay
 *   Order Status:   GET  /checkout/v2/order/{merchantOrderId}/status
 *
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Configuration ────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';
const PHONEPE_ENV = (process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase();

const BASE_URL =
  PHONEPE_ENV === 'PRODUCTION'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const OAUTH_URL =
  PHONEPE_ENV === 'PRODUCTION'
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : `${BASE_URL}/v1/oauth/token`;

console.log(`[PhonePeService] Environment: ${PHONEPE_ENV}, Base URL: ${BASE_URL}`);
console.log(`[PhonePeService] Client ID: ${CLIENT_ID ? CLIENT_ID.substring(0, 8) + '...' : 'NOT SET'}`);

// ─── OAuth Token Cache ────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a valid OAuth access token, refreshing if expired.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60_000) {
    // Token still valid (with 60s buffer)
    return cachedToken;
  }

  console.log('[PhonePeService] Fetching new OAuth token...');

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_version', CLIENT_VERSION);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(OAUTH_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = response.data;
  cachedToken = data.access_token;
  // expires_at is in seconds; convert to ms
  tokenExpiresAt = data.expires_at ? data.expires_at * 1000 : now + 30 * 60 * 1000;

  console.log(`[PhonePeService] OAuth token obtained, expires at ${new Date(tokenExpiresAt).toISOString()}`);
  return cachedToken;
}

// ─── Payment Initiation ──────────────────────────────────────────────────────
/**
 * Initiate a PhonePe Standard Checkout payment.
 *
 * @param {Object} opts
 * @param {string} opts.merchantOrderId  Unique order id for PhonePe
 * @param {number} opts.amount           Amount in paise (e.g. ₹149 → 14900)
 * @param {string} opts.redirectUrl      URL to redirect user after payment
 * @param {number} [opts.snfOrderId]     Our internal SNF Order ID
 * @param {number} [opts.productOrderId] Our internal Product Order ID
 * @param {number} [opts.memberId]       Member ID if applicable
 * @returns {{ merchantOrderId: string, checkoutUrl: string, orderId: string }}
 */
async function initiatePayment({
  merchantOrderId,
  amount,
  redirectUrl,
  snfOrderId,
  productOrderId,
  memberId,
}) {
  const token = await getAccessToken();

  const payload = {
    merchantOrderId,
    amount, // in paise
    expireAfter: 1200, // 20 minutes
    paymentFlow: {
      type: 'PG_CHECKOUT',
      message: 'Payment for SNF Market order',
      merchantUrls: {
        redirectUrl,
      },
    },
  };

  console.log(`[PhonePeService] Initiating payment: ${merchantOrderId}, amount: ${amount} paise`);

  const response = await axios.post(`${BASE_URL}/checkout/v2/pay`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
    },
  });

  const data = response.data;
  console.log(`[PhonePeService] Payment created: orderId=${data.orderId}, state=${data.state}`);

  // Persist to DB
  try {
    await prisma.phonePeTransaction.create({
      data: {
        merchantOrderId,
        phonePeOrderId: data.orderId || null,
        amount: amount / 100, // store in rupees
        state: 'PENDING',
        redirectUrl,
        ...(snfOrderId ? { snfOrderId } : {}),
        ...(productOrderId ? { productOrderId } : {}),
        ...(memberId ? { memberId } : {}),
      },
    });
  } catch (dbErr) {
    console.error('[PhonePeService] DB insert error (non-fatal):', dbErr.message);
  }

  return {
    merchantOrderId,
    checkoutUrl: data.redirectUrl,
    orderId: data.orderId,
  };
}

// ─── Order Status ────────────────────────────────────────────────────────────
/**
 * Check payment status for a given merchantOrderId.
 */
async function checkOrderStatus(merchantOrderId) {
  const token = await getAccessToken();

  const url = `${BASE_URL}/checkout/v2/order/${merchantOrderId}/status?details=true`;
  console.log(`[PhonePeService] Checking status for: ${merchantOrderId}`);

  const response = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
    },
  });

  const data = response.data;
  console.log(`[PhonePeService] Status response: state=${data.state}`);

  // Update DB record
  try {
    const existing = await prisma.phonePeTransaction.findFirst({
      where: { merchantOrderId },
    });
    if (existing) {
      const paymentDetail = data.paymentDetails?.[0];
      await prisma.phonePeTransaction.update({
        where: { id: existing.id },
        data: {
          state: data.state,
          phonePeOrderId: data.orderId || existing.phonePeOrderId,
          transactionId: paymentDetail?.transactionId || existing.transactionId,
          paymentMode: paymentDetail?.paymentMode || existing.paymentMode,
          completedAt: data.state === 'COMPLETED' ? new Date() : existing.completedAt,
        },
      });
    }
  } catch (dbErr) {
    console.error('[PhonePeService] DB update error (non-fatal):', dbErr.message);
  }

  return {
    merchantOrderId,
    orderId: data.orderId,
    state: data.state,
    amount: data.amount,
    paymentDetails: data.paymentDetails || [],
  };
}

// ─── Webhook Processing ──────────────────────────────────────────────────────
/**
 * Process a webhook callback from PhonePe.
 */
async function processWebhook(body) {
  console.log('[PhonePeService] Processing webhook:', JSON.stringify(body).substring(0, 200));

  // PhonePe webhooks include type and payload
  const eventType = body?.type;
  const payload = body?.payload;

  if (!payload) {
    console.warn('[PhonePeService] Webhook has no payload');
    return { received: true };
  }

  const merchantOrderId = payload.merchantOrderId;
  const state = payload.state;

  if (merchantOrderId) {
    try {
      const existing = await prisma.phonePeTransaction.findFirst({
        where: { merchantOrderId },
      });
      if (existing) {
        const paymentDetail = payload.paymentDetails?.[0];
        await prisma.phonePeTransaction.update({
          where: { id: existing.id },
          data: {
            state: state || existing.state,
            phonePeOrderId: payload.orderId || existing.phonePeOrderId,
            transactionId: paymentDetail?.transactionId || existing.transactionId,
            paymentMode: paymentDetail?.paymentMode || existing.paymentMode,
            webhookPayload: JSON.stringify(body),
            completedAt: state === 'COMPLETED' ? new Date() : existing.completedAt,
          },
        });
        console.log(`[PhonePeService] Webhook: Updated ${merchantOrderId} → ${state}`);

        // Update the Order's paymentStatus if completed
        if (state === 'COMPLETED') {
          if (existing.snfOrderId) {
            await prisma.sNFOrder.update({
              where: { id: existing.snfOrderId },
              data: {
                paymentStatus: 'PAID',
                paymentMode: 'PHONEPE',
                paymentRefNo: paymentDetail?.transactionId || payload.orderId,
                paymentDate: new Date(),
              },
            });
          }
          if (existing.productOrderId) {
            await prisma.productOrder.update({
              where: { id: existing.productOrderId },
              data: {
                paymentStatus: 'PAID',
                paymentMode: 'PHONEPE',
              },
            });
          }
        }
      }
    } catch (dbErr) {
      console.error('[PhonePeService] Webhook DB error:', dbErr.message);
    }
  }

  return { received: true, merchantOrderId, state };
}

module.exports = {
  initiatePayment,
  checkOrderStatus,
  processWebhook,
};
