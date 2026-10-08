const mongoose = require('mongoose');

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

async function connectDB() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error(
      'MONGO_URI is not set. Add it in Render → Environment (same value as your local .env).'
    );
  }

  // Fail fast on API calls instead of waiting 10s per query when DB is down.
  mongoose.set('bufferCommands', false);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });

  console.log('MongoDB connected');
}

function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDBConnected };
