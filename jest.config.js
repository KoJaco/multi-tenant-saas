/**
 * Jest Configuration
 *
 * Jest configuration for unit and integration tests
 */

export default {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
        "^~/(.*)$": "<rootDir>/app/$1",
    },
    testMatch: [
        "**/__tests__/**/*.test.ts",
        "**/__tests__/**/*.test.tsx",
        "**/?(*.)+(spec|test).ts",
        "**/?(*.)+(spec|test).tsx",
    ],
    collectCoverageFrom: [
        "app/**/*.{ts,tsx}",
        "!app/**/*.d.ts",
        "!app/**/__tests__/**",
        "!app/**/*.test.{ts,tsx}",
        "!app/**/*.spec.{ts,tsx}",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    testTimeout: 10000,
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: {
                    jsx: "react-jsx",
                },
            },
        ],
    },
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    globals: {
        "ts-jest": {
            useESM: true,
        },
    },
};
