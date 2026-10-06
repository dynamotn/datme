import path from "node:path"

// Every test reads the fixture vault, never the real one.
process.env.VAULT_PATH = path.resolve(import.meta.dir, "fixtures/vault")
