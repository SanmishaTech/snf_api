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
  console.log('[WhatsApp Service] Using Phone Number ID:', phoneNumberId);


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
      language: {
        code: 'en'
      },
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
  console.log('[WhatsApp Service] Sending Welcome to:', user.mobile, 'using ID:', phoneNumberId);


  const payload = {
    messaging_product: 'whatsapp',
    to: `91${user.mobile}`,
    type: 'template',
    template: {
      name: 'welcome',
      language: {
        code: 'en_US'
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: user.name }
          ]
        }
      ]
    }
  };
  console.log('[WhatsApp Service] Welcome Payload (en_US):', JSON.stringify(payload, null, 2));


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

module.exports = {
  sendOrderWhatsAppMessage,
  sendWelcomeWhatsAppMessage
};

