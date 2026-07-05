async function sendSMSOrange(phoneNumber, message) {
  try {
    const token = await getOrangeToken();

    const formattedNumber = phoneNumber.startsWith('+226')
      ? `tel:${phoneNumber}`
      : `tel:+226${phoneNumber.slice(-8)}`;

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

    console.log(response.data);

    return true;

  } catch (err) {
    console.error(err.response?.data || err.message);
    return false;
  }
}
