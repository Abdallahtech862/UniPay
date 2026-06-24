const mongoose = require('mongoose');
const Client = require('./models/Client');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const result = await Client.updateMany(
    { limiteJournaliere: { $exists: false } },
    { $set: { limiteJournaliere: 500000, limiteMensuelle: 5000000 } }
  );
  console.log(`${result.modifiedCount} clients mis à jour`);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
