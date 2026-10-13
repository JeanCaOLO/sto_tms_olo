import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import routeElementPlugin from './eslint-rules/route-element-jsx.js'

const autoImportGlobals = {
  // React
  React: 'readonly',
  useState: 'readonly',
  useEffect: 'readonly',
  useContext: 'readonly',
  useReducer: 'readonly',
  useCallback: 'readonly',
  useMemo: 'readonly',
  useRef: 'readonly',
  useImperativeHandle: 'readonly',
  useLayoutEffect: 'readonly',
  useDebugValue: 'readonly',
  useDeferredValue: 'readonly',
  useId: 'readonly',
  useInsertionEffect: 'readonly',
  useSyncExternalStore: 'readonly',
  useTransition: 'readonly',
  startTransition: 'readonly',
  lazy: 'readonly',
  memo: 'readonly',
  forwardRef: 'readonly',
  createContext: 'readonly',
  createElement: 'readonly',
  cloneElement: 'readonly',
  isValidElement: 'readonly',
  // React Router
  useNavigate: 'readonly',
  useLocation: 'readonly',
  useParams: 'readonly',
  useSearchParams: 'readonly',
  Link: 'readonly',
  NavLink: 'readonly',
  Navigate: 'readonly',
  Outlet: 'readonly',
  // React i18n
  useTranslation: 'readonly',
  Trans: 'readonly',
}

const TARIFAS_DIRS = [
  'src/lib/tarifas', 'src/pages/reglas-tarifa', 'src/pages/liquidaciones', 'src/pages/companias', 'src/components/tarifas',
]
const inTarifas = (pattern: string) => TARIFAS_DIRS.map((dir) => `${dir}/${pattern}`)
const TARIFAS_NOT_CHECKED = ['**/__tests__/**', '**/*.test.{ts,tsx}']

// Archivos que ya superaban su límite al cerrar la Fase 2 (deuda conocida). NO agregar archivos nuevos aquí.
const TARIFAS_SIZE_DEBT: string[] = [
  'src/lib/tarifas/data/schema.ts', // esquema declarativo, se deja entero a propósito
]

const sizeRule = (max: number) => ['error', { max, skipBlankLines: true, skipComments: true }] as const

function tarifasSizeLimits() {
  const base = { ignores: TARIFAS_NOT_CHECKED }
  return [
    { ...base, files: inTarifas('**/*.{ts,tsx}'), rules: { 'max-lines': sizeRule(200) } }, // módulos
    { ...base, files: inTarifas('**/*.tsx'), rules: { 'max-lines': sizeRule(150) } }, // componentes
    { ...base, files: inTarifas('**/*{DataSource,Api}.ts'), rules: { 'max-lines': sizeRule(150) } }, // servicios
    { ...base, files: [...inTarifas('**/page.tsx'), 'src/pages/companias/CompaniasView.tsx'], rules: { 'max-lines': sizeRule(200) } }, // páginas
    { ...base, files: inTarifas('**/use[A-Z]*.{ts,tsx}'), rules: { 'max-lines': sizeRule(80) } }, // hooks
    { files: TARIFAS_SIZE_DEBT, rules: { 'max-lines': 'off' } },
  ].filter((block) => block.files.length > 0)
}

// El código de la app no puede importar nada de `__tests__` (semilla, almacén en memoria, helpers):
// eso es solo de las pruebas. Así los datos de prueba nunca llegan al bundle de producción.
const noTestImports = {
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'src/test/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: ['**/__tests__/**'], message: 'Solo las pruebas pueden importar de __tests__.' }] }],
  },
}

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...autoImportGlobals,
        NodeJS: 'readonly',
        JSX: 'readonly',
        IdleRequestCallback: 'readonly',
        __BASE_PATH__: 'readonly',
        __IS_PREVIEW__: 'readonly',
        __READDY_PROJECT_ID__: 'readonly',
        __READDY_VERSION_ID__: 'readonly',
        __READDY_AI_DOMAIN__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'no-unused-expressions': 'off',
      'no-case-declarations': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-catch': 'off',
      'no-irregular-whitespace': 'off',
      'no-undef': 'error',
    },
  },
  // Límites de tamaño de standards/code-quality.md, SOLO en el módulo Tarifas y como "trinquete":
  // son errores para cualquier archivo nuevo o que crezca. Los que hoy ya exceden están listados en
  // `TARIFAS_SIZE_DEBT` (ver .test/07-registro-cambios-fase2.md); al partir uno, se quita de la lista.
  ...tarifasSizeLimits(),
  noTestImports,
  // Only enforce this rule for the router config file to avoid false positives elsewhere.
  {
    files: ['src/router/config.tsx'],
    plugins: {
      'local-route': routeElementPlugin,
    },
    rules: {
      'local-route/route-element-jsx': 'error',
    },
  },
]







