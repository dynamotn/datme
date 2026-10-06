import os from "node:os"
import path from "node:path"

export type Lang = "vi-VN" | "en-US"

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p
}

export const site = {
  /** Absolute path of the Obsidian vault to publish. Override with VAULT_PATH. */
  vault: path.resolve(expandHome(process.env.VAULT_PATH ?? "~/Documents/Notes")),
  url: "https://notes.dynamotn.dev",
  title: {
    "vi-VN": "Khu vườn số của Dynamo",
    "en-US": "Dynamo's Digital Garden",
  } satisfies Record<Lang, string>,
  tagline: {
    "vi-VN": "Sổ tay công khai · bộ não thứ hai",
    "en-US": "A public notebook · second brain",
  } satisfies Record<Lang, string>,
  author: "Dynamo",
  defaultLang: "vi-VN" as Lang,
  langs: ["vi-VN", "en-US"] as Lang[],
  /** Paths (relative to the vault) never scanned for notes. */
  ignore: [
    ".git",
    ".obsidian",
    ".publish",
    ".trash",
    "node_modules",
    "_assets/books",
    "_assets/templates",
    "_assets/snippets",
    "_assets/draw/scripts",
  ],
  /** Top-level Zettelkasten folders mapped to a note's maturity stage. */
  stages: {
    "01_Fleeting": "fleeting",
    "02_Literature": "literature",
    "03_Atomic": "atomic",
    "04_Permanent": "permanent",
    "05_Structure": "structure",
    "06_Reference": "reference",
    "07_Project": "project",
  } as Record<string, Stage>,
  footerLinks: {
    GitHub: "https://github.com/dynamotn",
    GitLab: "https://gitlab.com/dynamo.foss",
    Facebook: "https://www.facebook.com/dynamo.foss",
    Contact: "mailto:me@dynamotn.dev",
  },
}

export type Stage =
  | "fleeting"
  | "literature"
  | "atomic"
  | "permanent"
  | "structure"
  | "reference"
  | "project"
