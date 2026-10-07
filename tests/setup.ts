import path from "node:path"

// Every test reads the fixture vault, never the real one.
process.env.VAULT_PATH = path.resolve(import.meta.dir, "fixtures/vault")

// The password of the @testers group of the fixture vault, as a CI secret would hold it; @nobody stays unset.
process.env.DATME_LOCK_TESTERS = "tester-password"
delete process.env.DATME_LOCK_NOBODY
