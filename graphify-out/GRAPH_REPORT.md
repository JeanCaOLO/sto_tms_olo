# Graph Report - .  (2026-07-27)

## Corpus Check
- 83 files · ~53,457 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 443 nodes · 758 edges · 31 communities (27 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App Layout & Navigation
- UI Kit: Badge/Card/StatCard
- Lint & Build Tooling
- TypeScript App Config
- Package Dependencies
- Tracking Map View
- Page Routing Config
- Vite/Node Build Config
- Dashboard Charts & Ranking
- Route Planning Config
- Button & CSV Import Modal
- Store (Tienda) Modals
- Country Modal & Constants
- Supabase Client & Route Modals
- Contracts & Documents
- Input & Driver Modal
- Select & Vehicle Modals
- Returns (Devoluciones) Module
- Dispatch Guide Modal
- App Entry (index.html)
- Customer Modal
- ESLint Config Extras
- Role Modal
- User Modal
- TS Project References

## God Nodes (most connected - your core abstractions)
1. `supabase` - 36 edges
2. `Button()` - 35 edges
3. `compilerOptions` - 28 edges
4. `useAuth()` - 27 edges
5. `Badge()` - 20 edges
6. `Card()` - 17 edges
7. `compilerOptions` - 17 edges
8. `MapView()` - 7 edges
9. `scripts` - 6 edges
10. `RouteCard()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `ConfiguracionPage()` --calls--> `useAuth()`  [EXTRACTED]
  src/pages/configuracion/page.tsx → src/hooks/useAuth.tsx
- `TrackingPage()` --calls--> `useAuth()`  [EXTRACTED]
  src/pages/tracking/page.tsx → src/hooks/useAuth.tsx
- `AppLayout()` --calls--> `useAuth()`  [EXTRACTED]
  src/App.tsx → src/hooks/useAuth.tsx
- `SettlementModal()` --calls--> `useAuth()`  [EXTRACTED]
  src/pages/liquidaciones/components/SettlementModal.tsx → src/hooks/useAuth.tsx
- `LiquidacionesPage()` --calls--> `useAuth()`  [EXTRACTED]
  src/pages/liquidaciones/page.tsx → src/hooks/useAuth.tsx

## Import Cycles
- None detected.

## Communities (31 total, 4 thin omitted)

### Community 0 - "App Layout & Navigation"
Cohesion: 0.07
Nodes (33): App(), AppLayout(), getInitials(), Header(), roleColors, isGroup(), MenuGroup, MenuItem (+25 more)

### Community 1 - "UI Kit: Badge/Card/StatCard"
Cohesion: 0.08
Nodes (22): Badge(), BadgeProps, Card(), CardProps, StatCard(), StatCardProps, Country, Customer (+14 more)

### Community 2 - "Lint & Build Tooling"
Cohesion: 0.06
Nodes (35): autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jiti, devDependencies (+27 more)

### Community 3 - "TypeScript App Config"
Cohesion: 0.06
Nodes (34): DOM, DOM.Iterable, ES2022, src, vite-env.d.ts, compilerOptions, allowImportingTsExtensions, alwaysStrict (+26 more)

### Community 4 - "Package Dependencies"
Cohesion: 0.06
Nodes (33): date-fns, firebase, i18next, i18next-browser-languagedetector, dependencies, date-fns, firebase, i18next (+25 more)

### Community 5 - "Tracking Map View"
Cohesion: 0.09
Nodes (25): getStopDotClass(), getStopDotIcon(), getStopLabel(), getStopVariant(), MapView(), MapViewProps, resolveStopStatus(), Stop (+17 more)

### Community 6 - "Page Routing Config"
Cohesion: 0.09
Nodes (21): ClientesPage, ConductoresPage, ConfiguracionPage, ContratosPage, DashboardPage, DevolucionesPage, GuiasPage, HomePage (+13 more)

### Community 7 - "Vite/Node Build Config"
Cohesion: 0.10
Nodes (20): ES2023, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+12 more)

### Community 8 - "Dashboard Charts & Ranking"
Cohesion: 0.13
Nodes (13): Driver, DriversRanking(), DriversRankingProps, OrdersChart(), OrdersChartProps, ReturnsChart(), ReturnsChartProps, RoutesChart() (+5 more)

### Community 9 - "Route Planning Config"
Cohesion: 0.14
Nodes (13): Conductor, Props, RutaTipo, Transportista, Vehiculo, Conductor, optimizarParadas(), Pedido (+5 more)

### Community 10 - "Button & CSV Import Modal"
Cohesion: 0.15
Nodes (9): ButtonProps, CsvField, CsvImportModal(), CsvImportModalProps, ParsedRow, Carrier, CarrierModalProps, Country (+1 more)

### Community 11 - "Store (Tienda) Modals"
Cohesion: 0.14
Nodes (10): DeleteConfirmModal(), DeleteConfirmModalProps, Country, emptyForm, STORE_TYPES, StoreModalProps, TABS, Country (+2 more)

### Community 12 - "Country Modal & Constants"
Cohesion: 0.18
Nodes (9): Button(), CountryModal(), CountryModalProps, CURRENCIES, emptyForm, TABS, TIMEZONES, DeleteConfirmModalProps (+1 more)

### Community 13 - "Supabase Client & Route Modals"
Cohesion: 0.27
Nodes (7): Database, supabase, RouteModal(), RouteModalProps, RouteTypeDeleteModalProps, RouteTypeModal(), RouteTypeModalProps

### Community 14 - "Contracts & Documents"
Cohesion: 0.21
Nodes (7): Props, ContractDocument, docTypeConfig, Props, Contract, statusConfig, typeLabels

### Community 15 - "Input & Driver Modal"
Cohesion: 0.20
Nodes (6): Input, InputProps, Carrier, Driver, DriverModalProps, Driver

### Community 16 - "Select & Vehicle Modals"
Cohesion: 0.20
Nodes (5): Select, SelectProps, VehicleModalProps, ICON_OPTIONS, VehicleTypeModalProps

### Community 17 - "Returns (Devoluciones) Module"
Cohesion: 0.22
Nodes (5): ReturnModalProps, Return, statusColors, statusLabels, statusVariants

### Community 18 - "Dispatch Guide Modal"
Cohesion: 0.33
Nodes (4): Driver, GuideModalProps, Route, Vehicle

### Community 19 - "App Entry (index.html)"
Cohesion: 0.50
Nodes (5): index.html (App Entry HTML), Remixicon Icon Font (CDN), #root Mount Element, STO - Sistema de Transportes OLO, main.tsx (App Bootstrap Script)

### Community 20 - "Customer Modal"
Cohesion: 0.40
Nodes (3): Country, Customer, CustomerModalProps

## Knowledge Gaps
- **232 isolated node(s):** `autoImportGlobals`, `@stripe/react-stripe-js`, `@supabase/supabase-js`, `date-fns`, `firebase` (+227 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Supabase Client & Route Modals` to `App Layout & Navigation`, `UI Kit: Badge/Card/StatCard`, `Tracking Map View`, `Dashboard Charts & Ranking`, `Route Planning Config`, `Button & CSV Import Modal`, `Store (Tienda) Modals`, `Country Modal & Constants`, `Input & Driver Modal`, `Select & Vehicle Modals`, `Returns (Devoluciones) Module`, `Dispatch Guide Modal`, `Customer Modal`, `Role Modal`, `User Modal`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `App Layout & Navigation` to `UI Kit: Badge/Card/StatCard`, `Tracking Map View`, `Supabase Client & Route Modals`, `Route Planning Config`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Button()` connect `Country Modal & Constants` to `App Layout & Navigation`, `UI Kit: Badge/Card/StatCard`, `Dashboard Charts & Ranking`, `Route Planning Config`, `Button & CSV Import Modal`, `Store (Tienda) Modals`, `Supabase Client & Route Modals`, `Input & Driver Modal`, `Select & Vehicle Modals`, `Returns (Devoluciones) Module`, `Dispatch Guide Modal`, `Customer Modal`, `Role Modal`, `User Modal`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `autoImportGlobals`, `@stripe/react-stripe-js`, `@supabase/supabase-js` to the rest of the system?**
  _232 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Layout & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.06938020351526364 - nodes in this community are weakly interconnected._
- **Should `UI Kit: Badge/Card/StatCard` be split into smaller, more focused modules?**
  _Cohesion score 0.07928118393234672 - nodes in this community are weakly interconnected._
- **Should `Lint & Build Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._