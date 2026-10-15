
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter your new Master Admin password: ", async (password) => {
  try {
    if (password.length < 12) {
      throw new Error("Use a password of at least 12 characters.");
    }

    const hash = await bcrypt.hash(password, 12);
    console.log("\nGenerated bcrypt hash:\n" + hash);
  } catch (error) {
    console.error(error.message);
  } finally {
    rl.close();
  }
});
