import os from "node:os"
import path from "node:path"

// Every test reads the fixture vault, never the real one.
process.env.VAULT_PATH = path.resolve(import.meta.dir, "fixtures/vault")

// Builds without DATME_CACHE cache in the system's cache directory: tests keep theirs out of the user's.
process.env.XDG_CACHE_HOME = path.join(os.tmpdir(), "datme-test-cache")

// The password of the @testers group of the fixture vault, as a CI secret would hold it; @nobody stays unset.
process.env.DATME_LOCK_TESTERS = "tester-password"
delete process.env.DATME_LOCK_NOBODY
