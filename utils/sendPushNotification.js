const axios = require('axios');
const Client = require('../models/Client');

async function sendSMSOrange(phoneNumber, message) {
  try {
    const token = await getOrangeToken();
    
    // 1. Nettoyage du numéro : on ne garde que les chiffres
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // 2. Gestion stricte du format Burkina Faso (+226) à 10 chiffres (ex: 01XXXXXXXX)
    let finalNumber = '';
    if (cleanNumber.startsWith('226')) {
      finalNumber = `tel:+${cleanNumber}`;
    } else if (cleanNumber.length === 10) {
      finalNumber = `tel:+226${cleanNumber}`;
    } else if (cleanNumber.length === 8) {
      // Sécurité si vous utilisez encore l'ancien format à 8 chiffres : on ajoute le préfixe '01' d'Orange
      finalNumber = `tel:+22601${cleanNumber}`;
    } else {
      finalNumber = `tel:+226${cleanNumber}`;
    }

    // 3. Récupération propre de l'expéditeur (valeur par défaut si non définie dans Railway)
    const senderAddress = process.env.ORANGE_SENDER_ADDRESS || 'tel:+226821242';
    const senderName = process.env.ORANGE_SENDER_NAME || '821242';

    // L'URL requiert souvent l'expéditeur encodé, mais le corps du texte doit rester strict
    const response = await axios.post(
      `https://orange.com{encodeURIComponent(senderAddress)}/requests`,
      {
        outboundSMSMessageRequest: {
          address: finalNumber,
          senderAddress: senderAddress,
          senderName: senderName,
          outboundSMSTextMessage: {
            message: message,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('SMS envoyé avec succès');
    console.log(response.data);
    return true;
  } catch (err) {
    // Affiche le détail complet de l'erreur (notamment le contenu du tableau de variables d'Orange)
    console.error(
      'SMS Orange error :', 
      JSON.stringify(err.response?.data, null, 2) || err.message
    );
    return false;
  }
}


module.exports = { sendPushNotification };
