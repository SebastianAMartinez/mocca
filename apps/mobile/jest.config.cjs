const expoPreset = require("jest-expo/jest-preset");
const babelTransform = "\\.[jt]sx?$";
const babelOptions = expoPreset.transform[babelTransform][1];

const shared = {
	setupFilesAfterEnv: ["<rootDir>/tests/setup.tsx"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	transformIgnorePatterns: [
		"node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation))",
	],
};

module.exports = {
	projects: [
		{
			...shared,
			displayName: "native",
			preset: "jest-expo",
			testMatch: [
				"<rootDir>/tests/**/*.test.ts",
				"<rootDir>/tests/**/*.test.tsx",
			],
			testPathIgnorePatterns: ["/node_modules/", "\\.web\\.test\\.tsx$"],
		},
		{
			...shared,
			displayName: "web",
			preset: "jest-expo",
			transform: {
				[babelTransform]: [
					"babel-jest",
					{
						...babelOptions,
						caller: { ...babelOptions.caller, platform: "web" },
					},
				],
			},
			testMatch: ["<rootDir>/tests/**/*.web.test.tsx"],
		},
	],
};
