export const SAMPLE_PACKAGE_JSON = `{
  "name": "field-notes",
  "engines": { "node": ">=18 <20" },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "next": "^15.0.0",
    "zod": "^3.23.8",
    "swr": "^2.2.5"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "eslint": "^9.0.0",
    "vitest": "^2.0.0",
    "prettier": "^3.3.3",
    "@types/react": "^18.3.0",
    "@types/node": "^20.14.0"
  },
  "optionalDependencies": {
    "fsevents": "~2.3.3"
  }
}
`;

export const SAMPLE_LOCK = `{
  "name": "field-notes",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "field-notes",
      "engines": { "node": ">=18 <20" },
      "dependencies": {
        "react": "^18.3.1",
        "react-dom": "^18.3.1",
        "next": "^15.0.0",
        "zod": "^3.23.8",
        "swr": "^2.2.5"
      },
      "devDependencies": {
        "typescript": "^5.6.0",
        "eslint": "^9.0.0",
        "vitest": "^2.0.0",
        "prettier": "^3.3.3",
        "@types/react": "^18.3.0",
        "@types/node": "^20.14.0"
      },
      "optionalDependencies": { "fsevents": "~2.3.3" }
    },
    "node_modules/react": {
      "version": "18.3.1",
      "dependencies": { "loose-envify": "^1.1.0" }
    },
    "node_modules/loose-envify": { "version": "1.4.0" },
    "node_modules/react-dom": {
      "version": "18.3.1",
      "dependencies": { "react": "^18.3.1", "scheduler": "^0.23.2" }
    },
    "node_modules/scheduler": { "version": "0.23.2" },
    "node_modules/next": {
      "version": "15.0.3",
      "dependencies": {
        "react": "^18.3.1",
        "styled-jsx": "5.1.6",
        "busboy": "1.6.0",
        "postcss": "8.4.47",
        "nanoid": "^5.0.0",
        "picocolors": "^1.1.0",
        "caniuse-lite": "^1.0.30001600",
        "graceful-fs": "^4.2.0",
        "source-map": "^0.6.1",
        "watchpack": "^2.4.0"
      }
    },
    "node_modules/styled-jsx": { "version": "5.1.6" },
    "node_modules/busboy": { "version": "1.6.0" },
    "node_modules/postcss": { "version": "8.4.47" },
    "node_modules/nanoid": { "version": "5.0.7" },
    "node_modules/picocolors": { "version": "1.1.1" },
    "node_modules/caniuse-lite": { "version": "1.0.30001680" },
    "node_modules/graceful-fs": { "version": "4.2.11" },
    "node_modules/source-map": { "version": "0.6.1" },
    "node_modules/watchpack": { "version": "2.4.2" },
    "node_modules/zod": { "version": "3.23.8" },
    "node_modules/swr": {
      "version": "2.2.5",
      "dependencies": { "use-sync-external-store": "^1.2.0", "dequal": "^2.0.3" }
    },
    "node_modules/use-sync-external-store": { "version": "1.2.2" },
    "node_modules/dequal": { "version": "2.0.3" },
    "node_modules/typescript": { "version": "5.6.3" },
    "node_modules/eslint": {
      "version": "9.12.0",
      "dependencies": { "@eslint/config-array": "^0.18.0", "glob": "^10.0.0" }
    },
    "node_modules/@eslint/config-array": { "version": "0.18.0" },
    "node_modules/glob": { "version": "10.4.5" },
    "node_modules/vitest": {
      "version": "2.1.4",
      "dependencies": { "vite": "^5.4.0", "chai": "^5.1.0" }
    },
    "node_modules/vite": { "version": "5.4.10" },
    "node_modules/chai": { "version": "5.1.2" },
    "node_modules/prettier": { "version": "3.3.3" },
    "node_modules/@types/react": { "version": "18.3.12" },
    "node_modules/@types/node": { "version": "20.16.11" },
    "node_modules/fsevents": { "version": "2.3.3" }
  }
}
`;

export const SAMPLE_FILES = [
  { name: "package.json", text: SAMPLE_PACKAGE_JSON },
  { name: "package-lock.json", text: SAMPLE_LOCK },
];
