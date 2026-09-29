# 2026-09-17 — 2-opt, paradas compartidas en el mapa, capacidad+% en reparto

## What changed

### 1. Optimizador: pase 2-opt sobre vecino más cercano
`optimize-stops.ts` ahora aplica **2-opt** después del vecino más cercano: mientras
encuentra un cruce, invierte el segmento entre dos aristas si acorta la ruta (ruta
abierta, sin volver al depósito). Es el estándar práctico (NN construye, 2-opt
mejora ~10-15%). Verificado en la data demo: **4-7% más corto** que NN solo.
Referencias: NN + 2-opt son los heurísticos base del TSP; Lin-Kernighan (LKH) es el
tope de calidad pero mucho más complejo — innecesario para ≤50 paradas.

### 2. Mapa: paradas compartidas visibles
`RutaMapaPreview` agrupa las paradas por coordenada: cuando **2+ pedidos** caen en
el mismo punto, se pinta **un solo pin ámbar con un badge con la cantidad**, y al
hacer click muestra **todos los pedidos** de esa parada (modal). Antes se apilaban y
solo se veía el último.

### 3. Reparto de flota: capacidad + % por vehículo
En la lista de vehículos del reparto, cada vehículo muestra al lado su
**capacidad y el % que ocupan sus pedidos asignados** (tras "Sugerir vehículos" o
"Calcular Reparto"), sin barra — texto plano (`8.000 kg · 47%`). `FlotaSlotPicker`
recibe `resultado` y lo calcula por vehículo.

## Why

Pedidos del usuario: que el optimizador se luzca (2-opt), que las paradas
compartidas se noten en el mapa, y ver capacidad/% en el reparto sin barra.

## How

`tsc` limpio; `vitest run src/pages/planificacion` → 79/79 (incluye test de 2-opt).
Deploy a Amplify `dev`.
