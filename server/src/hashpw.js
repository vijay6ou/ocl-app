'use strict';
/**
 * Small helper: generate a bcrypt hash for a password, for seeding an admin
 * account or resetting one from the command line.
 *
 *   node src/hashpw.js 'MyNewPassword'
 */
const { hashPassword } = require('./auth');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node src/hashpw.js <password>');
  process.exit(1);
}
if (plain.length < 6) {
  console.error('Refusing: password must be at least 6 characters.');
  process.exit(1);
}
console.log(hashPassword(plain));
