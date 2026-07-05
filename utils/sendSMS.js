const response = await axios.post(
  `https://api.orange.com/smsmessaging/v1/outbound/${process.env.ORANGE_SENDER_ADDRESS}/requests`,
  {
    outboundSMSMessageRequest: {
      address: formattedNumber,
      senderAddress: process.env.ORANGE_SENDER_ADDRESS,
      senderName: process.env.ORANGE_SENDER_NAME,
      outboundSMSTextMessage: {
        message
      }
    }
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  }
);

console.log("Réponse Orange :", response.data);

return true;
