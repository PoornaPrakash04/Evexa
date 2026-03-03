const bcrypt = require("bcrypt");

async function hashPasswords() {
  const passwords = [
    "aarushi123",
    "adithya123",
    "adityaml123",
    "adyasree123",
    "afra123",
    "afreen123",
    "ajgowri123",
    "akasa123",
    "aksasusan123",
    "alaa123",
    "ananya123",
    "anjanagopan123",
    "anjum123",
    "aparnaroy123",
    "aparna123",
    "ardra123",
    "ardrabm123",
    "arundhathy123",
    "arunima123",
    "aryananda123",
    "avanikrishna123",
    "avani123",
    "bhavya123",
    "devamritha123",
    "devananda123",
    "devapriya123",
    "devika123",
    "devkass123",
    "demp123",
    "devi123",
    "durga123",
    "gopikrishna123",
    "gopika123",
    "hafila123",
    "jitha123",
    "karthika123",
    "krishna123",
    "nadhiya123",
    "nanditha123",
    "nasrin123",
    "nikitha123",
    "pournami123",
    "raina123",
    "ranjana123",
    "rithika123",
    "vandana123",
    "samyuktha123",
    "sathya123",
    "hashmi123",
    "shivanisn123",
    "shyama123",
    "sreelakshmi123",
    "swathy123",
    "thasneem123",
    "afiya123",
    "aiswarya123",
    "manupriya123"
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