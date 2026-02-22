const bcrypt = require("bcrypt");

async function hashPassword() {
  const plainPassword = "sanika@123";   // change this
  const saltRounds = 10;

  const hashed = await bcrypt.hash(plainPassword, saltRounds);

  console.log("Hashed password:");
  console.log(hashed);
}

hashPassword();
