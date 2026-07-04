const axios = require('axios');

async function getOrangeToken() {
  const auth = Buffer.from(`${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`).toString('base64');
  
  const res = await axios.post(
    'https://api.orange.com/oauth/v3/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return res.data.access_token;
}

async function sendSMSOrange(phoneNumber, message) {
  try {
    const token = await getOrangeToken();
    
    // Format numéro : +226XXXXXXXX ou tel:+226XXXXXXXX
    const formattedNumber = phoneNumber.startsWith('+226') 
      ? `tel:${phoneNumber}` 
      : `tel:+226${phoneNumber}`;

    await axios.post(
      `https://api.orange.com/smsmessaging/v1/outbound/${process.env.ORANGE_SENDER_ADDRESS}/requests`,
      {
        outboundSMSMessageRequest: {
          address: formattedNumber,
          senderAddress: process.env.ORANGE_SENDER_ADDRESS,
          senderName: process.env.ORANGE_SENDER_NAME, // Ex: "UniPay"
          outboundSMSTextMessage: {
            message: message
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`SMS envoyé à ${phoneNumber}`);
    return true;
  } catch (err) {
    console.error('Erreur SMS Orange:', err.response?.data || err.message);
    return false;
  }
}

module.exports = { sendSMSOrange };
