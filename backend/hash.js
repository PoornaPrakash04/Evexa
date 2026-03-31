const bcrypt = require("bcrypt");

async function hashPasswords() {
  const passwords = [
    "anjana123",
  ];

  const saltRounds = 10;

  const hashedPasswords = await Promise.all(
    passwords.map(password => bcrypt.hash(password, saltRounds))
  );

  hashedPasswords.forEach((hash, index) => {
    console.log(`Password: ${passwords[index]}`);
    console.log(`Hash: ${hash}\n`);
  });
}

hashPasswords();