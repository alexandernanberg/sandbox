import baseConfig from 'eslint-config-alexandernanberg/base'
import reactConfig from 'eslint-config-alexandernanberg/react'

/** @type {import('typescript-eslint').Config} */
export default [
  {ignores: ['dist', 'node_modules']},
  ...baseConfig,
  ...reactConfig,
]
