/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Update transform to NOT include 'isolatedModules' here anymore
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // isolatedModules: true,  <-- REMOVE THIS LINE
      },
    ],
  },

  moduleNameMapper: {
    "^uuid$": "<rootDir>/src/test/__mock__/uuid.ts",
  },

  clearMocks: true,
};
