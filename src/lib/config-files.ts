/** Config file names looked up at the root of the vault, in order. Free of imports, so the CLI can use it before any config loads. */
export const CONFIG_FILES = ["datme.yaml", "datme.yml", ".datme.yaml"]

/** Where the JSON Schema of datme.yaml is published, with the documentation. */
export const SCHEMA_URL = "https://dynamo-brain.gitlab.io/datme/datme.schema.json"
