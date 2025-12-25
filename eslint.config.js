import jest from 'eslint-plugin-jest';
import importPlugin from 'eslint-plugin-import';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['src/examples/**', 'src/bench/**'],
  },
  ...tsPlugin.configs['flat/recommended'],
  {
    plugins: {
      import: importPlugin,
    },
    settings: importPlugin.configs.typescript.settings,
    rules: {
      ...importPlugin.configs.errors.rules,
      ...importPlugin.configs.warnings.rules,
      ...importPlugin.configs.typescript.rules,
    },
  },
  {
    plugins: {
      jest,
    },
    rules: {
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      '@typescript-eslint/prefer-namespace-keyword': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-use-before-define': 0,
      'max-classes-per-file': ['error', 1],
      'import/prefer-default-export': 0,
      'import/no-dynamic-require': 0,
      'import/named': 2,
      'import/namespace': 2,
      'import/default': 2,
      'import/export': 2,
      'import/no-unresolved': 0,
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          groups: ['external', 'internal', 'index', 'sibling', 'parent', 'builtin'],
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
    },
  },
];
