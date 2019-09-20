module.exports = {
    plugins: ['mocha'],
    globals: {
      it: true,
      artifacts: true,
      contract: true,
      describe: true,
      before: true,
      beforeEach: true,
      web3: true,
      assert: true,
      abi: true,
      after: true,
      afterEach: true
    },
    "parserOptions": {
        "ecmaVersion": 2017,
        "sourceType": "module",
    },
    "env": {
        "es6": true
    },
    rules: {
      'mocha/no-exclusive-tests': 'error',
      'jest/prefer-expect-assertions': 0, // Smart contract tests are using mocha...
    },
  }
  