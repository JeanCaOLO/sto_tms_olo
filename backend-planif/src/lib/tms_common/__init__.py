"""Capa común portada de TMS-Frontend `origin/main:backend/common-services`.

Reubicada en el esqueleto hexagonal como infraestructura compartida: acceso a
Aurora (`pg`), configuración por Secrets Manager (`config`, `secrets`), sesión
JWT (`tokens`), serialización de respuestas (`responses`), lectura del evento
HTTP API (`event`), errores (`errors`) y el wrapper de handler (`handler`).

Sólo la usan los adaptadores (inbound/outbound), nunca el dominio.
"""
