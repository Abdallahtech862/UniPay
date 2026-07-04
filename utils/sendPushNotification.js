const axios = require('axios');
const Client = require('../models/Client');

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const user = await Client.findById(userId);
    
    if (!user ||!user.expoPushToken ||!user.notificationsEnabled) {
      return; // Skip si pas de token ou notifs désactivées
    }

    const message = {
      to: user.expoPushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high'
    };

    await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    console.log(`Notif envoyée à ${user.telephone}: ${title}`);
  } catch (err) {
    console.error('Erreur push:', err.response?.data || err.message);
  }
}

module.exports = { sendPushNotification };
