"""Casos de uso: orquestan el dominio (motor + estados) con los ports.

No conocen HTTP ni SQL. Reciben las implementaciones de los ports por
constructor (inyección de dependencias); los handlers inbound los arman con los
adaptadores Aurora concretos (`app.wiring`).
"""
