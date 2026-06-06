const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app');
  console.log('Connected to MongoDB');

  // Clean up
  await User.deleteOne({ email: 'test_auth_flow@example.com' });

  const plainPassword = 'mySecurePassword123!';
  
  // 1. Create user
  console.log('1. Creating user...');
  const user = await User.create({
    username: 'test_auth_flow',
    email: 'test_auth_flow@example.com',
    password: plainPassword,
  });

  console.log('Created user password in-memory:', user.password);
  
  // Check password immediately
  let match = await user.comparePassword(plainPassword);
  console.log('Match immediately after create:', match);

  // 2. Modify another field and save (simulate saveUser in register)
  console.log('2. Simulating second save (refreshToken update)...');
  user.refreshToken = 'some_refresh_token';
  console.log('Is password modified before second save?', user.isModified('password'));
  
  await user.save();
  console.log('After second save, password in-memory:', user.password);

  // Check password after second save
  match = await user.comparePassword(plainPassword);
  console.log('Match after second save:', match);

  // 3. Retrieve from DB and check
  console.log('3. Retrieving user from database...');
  const dbUser = await User.findOne({ email: 'test_auth_flow@example.com' });
  console.log('DB user password:', dbUser.password);
  
  match = await dbUser.comparePassword(plainPassword);
  console.log('Match from retrieved DB user:', match);

  await User.deleteOne({ email: 'test_auth_flow@example.com' });
  await mongoose.disconnect();
}

test().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
