import { readFile } from "node:fs/promises";

function parseDotenv(text) {
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("Invalid .env line: expected NAME=value.");
    }

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid .env variable name: ${name}.`);
    }

    const quoted = value.match(/^(["'])(.*)\1$/);
    if (quoted) value = quoted[2];
    values[name] = value;
  }

  return values;
}

export async function loadLocalEnv(path = ".env") {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const [name, value] of Object.entries(parseDotenv(content))) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}
