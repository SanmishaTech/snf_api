const dayjs = require('dayjs');

/**
 * Send WhatsApp notification for an SNF Order
 * @param {Object} order - The created order object
 * @returns {Promise<Object>} - API response
 */
const sendOrderWhatsAppMessage = async (order) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl) {
    console.warn('[WhatsApp Service] Configuration missing, skipping message.', {
      token: token ? 'Provided' : 'Missing',
      phoneNumberId: phoneNumberId || 'Missing',
      baseUrl: baseUrl || 'Missing'
    });
    return null;
  }

  // Payment mode mapping (English to Marathi)
  const paymentModeMap = {
    'CASH': 'रोख',
    'CARD': 'Card',
    'UPI': 'UPI',
    'BANK': 'धनादेश',
    'WALLET': 'वॉलेट'
  };

  const payload = {
    messaging_product: 'whatsapp',
    to: `91${order.mobile}`,
    type: 'template',
    template: {
      name: 'general_receipt',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: dayjs(order.createdAt).format('DD/MM/YYYY') },
            { type: 'text', text: 'SNF Order' },
            { type: 'text', text: order.orderNo },
            { type: 'text', text: order.totalAmount.toString() },
            { type: 'text', text: paymentModeMap[order.paymentMode] || order.paymentMode || 'N/A' }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send message:', data);
      return { success: false, error: data };
    }

    console.log('[WhatsApp Service] Message sent successfully:', order.orderNo);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send Welcome WhatsApp message for a new User
 * @param {Object} user - The created user object (should have name and mobile)
 * @returns {Promise<Object>} - API response
 */
const sendWelcomeWhatsAppMessage = async (user) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'welcome',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/marketing_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send welcome message:', data);
      return { success: false, error: data };
    }
    console.log('[WhatsApp Service] Welcome message sent successfully to:', user.mobile);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending welcome message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send Subscription Confirmation WhatsApp message
 * @param {Object} user - User object (name, mobile)
 * @param {Object} subscription - Subscription object (startDate, expiryDate, qty, deliverySchedule)
 * @returns {Promise<Object>} - API response
 */
const sendSubscriptionConfirmWhatsAppMessage = async (user, subscription) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user.mobile) {
    return null;
  }

  const startDate = dayjs(subscription.startDate).format('DD/MM/YYYY');
  const endDate = dayjs(subscription.expiryDate).format('DD/MM/YYYY');
  
  const scheduleMap = {
    'DAILY': 'Daily',
    'WEEKDAYS': 'Select Days',
    'ALTERNATE_DAYS': 'Alternate Days',
    'VARYING': 'Varying'
  };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'subscription_confirmation',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name },
            { type: 'text', text: startDate },
            { type: 'text', text: endDate },
            { type: 'text', text: subscription.qty.toString() },
            { type: 'text', text: scheduleMap[subscription.deliverySchedule] || subscription.deliverySchedule }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/marketing_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send subscription confirmation:', data);
      return { success: false, error: data };
    }
    console.log('[WhatsApp Service] Subscription confirmation sent successfully to:', user.mobile);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending subscription confirmation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Delivery Confirmation
 * @param {Object} user User object containing mobile and name
 * @param {Object} deliveryEntry Delivery entry object containing quantity
 */
const sendDeliveryWhatsAppMessage = async (user, deliveryEntry) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'delivery_message',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name || 'Customer' },
            { type: 'text', text: String(deliveryEntry.quantity || 1) }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send delivery message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Delivery message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending delivery message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Subscription Renewal Reminder
 * @param {Object} user User object containing mobile and name
 * @param {Object} subscription Subscription object containing expiryDate
 */
const sendSubscriptionRenewalWhatsAppMessage = async (user, subscription) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'subscription_renewal_reminder_1',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name || 'Customer' },
            { type: 'text', text: dayjs(subscription.expiryDate).format('DD/MM/YYYY') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/marketing_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send renewal reminder message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Renewal reminder message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending renewal reminder message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Skipped Delivery
 * @param {Object} user User object containing mobile and name
 * @param {Object} skipData object containing date and refundAmount
 */
const sendSkipDeliveryWhatsAppMessage = async (user, skipData) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'skip_delivery',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') },
            { type: 'text', text: String(skipData.date) },
            { type: 'text', text: String(skipData.refundAmount) }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send skip delivery message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Skip delivery message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending skip delivery message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Not Delivered (Attempt Failed)
 * @param {Object} user User object containing mobile and name
 * @param {Object} failData object containing reason and refundAmount
 */
const sendNotDeliveredWhatsAppMessage = async (user, failData) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'not_delivered',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') },
            { type: 'text', text: String(failData.orderNo || 'N/A') },
            { type: 'text', text: String(failData.reason || 'Delivery attempt failed') },
            { type: 'text', text: String(failData.refundAmount || '0.00') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send not delivered message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Not delivered message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending not delivered message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Cancelled Subscription (Refunded to Wallet)
 * @param {Object} user User object containing mobile and name
 * @param {Object} cancelData object containing orderNo, reason, and refundAmount
 */
const sendCancelledWhatsAppMessage = async (user, cancelData) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'cancelled_refunded_in_wallet',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') },
            { type: 'text', text: String(cancelData.orderNo || 'N/A') },
            { type: 'text', text: String(cancelData.reason || 'Cancelled via dashboard') },
            { type: 'text', text: String(cancelData.orderNo || 'N/A') },
            { type: 'text', text: String(cancelData.reason || 'Cancelled via dashboard') },
            { type: 'text', text: String(cancelData.refundAmount || '0.00') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send cancellation message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Cancellation message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending cancellation message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Wallet Debit
 * @param {Object} user User object containing mobile and name
 * @param {Number|String} walletamt Amount debited from wallet
 * @param {String} orderNo Order number
 */
const sendWalletDebitWhatsAppMessage = async (user, walletamt, orderNo) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'wallet_debit',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') },
            { type: 'text', text: String(walletamt || '0.00') },
            { type: 'text', text: String(orderNo || 'N/A') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send wallet debit message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Wallet debit message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending wallet debit message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Wallet Credit
 * @param {Object} user User object containing mobile and name
 * @param {Number|String} amount Amount credited to wallet
 * @param {String} orderNo Order number
 */
const sendWalletCreditWhatsAppMessage = async (user, amount, orderNo) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'wallet_credit',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(user.name || 'Customer') },
            { type: 'text', text: String(amount || '0.00') },
            { type: 'text', text: String(orderNo || 'N/A') }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send wallet credit message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Wallet credit message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending wallet credit message:', error);
    return { success: false, error: error.message };
  }
};
/**
 * Send WhatsApp Notification for Subscription Renewal Pending (1 day after expiry)
 * @param {Object} user User object containing mobile and name
 */
const sendSubscriptionRenewalPendingWhatsAppMessage = async (user) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'subscription_renewal_reminder_2',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name || 'Customer' }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/marketing_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send renewal pending message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Renewal pending message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending renewal pending message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Notification for Subscription Renewal Final (1 day before expiry)
 * @param {Object} user User object containing mobile and name
 */
const sendSubscriptionRenewalFinalWhatsAppMessage = async (user) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl = process.env.WHATSAPP_URL;

  if (!token || !phoneNumberId || !baseUrl || !user || !user.mobile) {
    return null;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'subscription_renewal_reminder_final',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name || 'Customer' }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`${baseUrl}/${phoneNumberId}/marketing_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Failed to send renewal final message:', data);
      return { success: false, error: data };
    }
    console.log(`[WhatsApp Service] Renewal final message sent successfully to ${user.mobile}`);
    return { success: true, data };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending renewal final message:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOrderWhatsAppMessage,
  sendWelcomeWhatsAppMessage,
  sendSubscriptionConfirmWhatsAppMessage,
  sendDeliveryWhatsAppMessage,
  sendSubscriptionRenewalWhatsAppMessage,
  sendSubscriptionRenewalPendingWhatsAppMessage,
  sendSubscriptionRenewalFinalWhatsAppMessage,
  sendSkipDeliveryWhatsAppMessage,
  sendNotDeliveredWhatsAppMessage,
  sendCancelledWhatsAppMessage,
  sendWalletDebitWhatsAppMessage,
  sendWalletCreditWhatsAppMessage
};
