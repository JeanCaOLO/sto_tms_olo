import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';

interface SeedResult {
  module: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message: string;
  count?: number;
}

export default function SeedPage() {
  const { session } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState<SeedResult[]>([]);

  const updateResult = (module: string, status: SeedResult['status'], message: string, count?: number) => {
    setResults(prev => {
      const existing = prev.find(r => r.module === module);
      if (existing) {
        return prev.map(r => r.module === module ? { module, status, message, count } : r);
      }
      return [...prev, { module, status, message, count }];
    });
  };

  const seedPaises = async (organizationId: string) => {
    updateResult('Países', 'loading', 'Insertando países...');
    try {
      const paises = [
        { 
          code: 'CL', 
          name: 'Chile', 
          iso_code: 'CHL', 
          currency: 'CLP', 
          timezone: 'America/Santiago', 
          phone_code: '+56',
          flag_emoji: '🇨🇱',
          capital: 'Santiago',
          language: 'Español',
          notes: 'País con alta actividad logística en la región sur',
          status: 'active',
          organization_id: organizationId 
        },
        { 
          code: 'PE', 
          name: 'Perú', 
          iso_code: 'PER', 
          currency: 'PEN', 
          timezone: 'America/Lima', 
          phone_code: '+51',
          flag_emoji: '🇵🇪',
          capital: 'Lima',
          language: 'Español',
          notes: 'Operaciones concentradas en Lima y Callao',
          status: 'active',
          organization_id: organizationId 
        },
        { 
          code: 'CO', 
          name: 'Colombia', 
          iso_code: 'COL', 
          currency: 'COP', 
          timezone: 'America/Bogota', 
          phone_code: '+57',
          flag_emoji: '🇨🇴',
          capital: 'Bogotá',
          language: 'Español',
          notes: 'Red de distribución en expansión',
          status: 'active',
          organization_id: organizationId 
        },
        { 
          code: 'AR', 
          name: 'Argentina', 
          iso_code: 'ARG', 
          currency: 'ARS', 
          timezone: 'America/Argentina/Buenos_Aires', 
          phone_code: '+54',
          flag_emoji: '🇦🇷',
          capital: 'Buenos Aires',
          language: 'Español',
          notes: 'Cobertura en zona metropolitana y provincias',
          status: 'active',
          organization_id: organizationId 
        },
        { 
          code: 'MX', 
          name: 'México', 
          iso_code: 'MEX', 
          currency: 'MXN', 
          timezone: 'America/Mexico_City', 
          phone_code: '+52',
          flag_emoji: '🇲🇽',
          capital: 'Ciudad de México',
          language: 'Español',
          notes: 'Operaciones en CDMX y área metropolitana',
          status: 'active',
          organization_id: organizationId 
        }
      ];

      const { data, error } = await supabase.from('countries').insert(paises).select();
      if (error) throw error;

      updateResult('Países', 'success', 'Países insertados correctamente', paises.length);
      return data;
    } catch (error: any) {
      updateResult('Países', 'error', error.message);
      throw error;
    }
  };

  const seedTransportistas = async (organizationId: string, paises: any[]) => {
    updateResult('Transportistas', 'loading', 'Insertando transportistas...');
    try {
      const transportistas = [
        {
          name: 'Transportes Rápidos del Sur',
          rut: '76.123.456-7',
          contact_name: 'Juan Pérez',
          email: 'contacto@rapidossur.cl',
          phone: '+56912345678',
          address: 'Av. Libertador 1234',
          country_id: paises.find(p => p.code === 'CL')?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Logística Express Perú',
          rut: '20123456789',
          contact_name: 'María González',
          email: 'info@logisticaexpress.pe',
          phone: '+51987654321',
          address: 'Jr. Los Olivos 567',
          country_id: paises.find(p => p.code === 'PE')?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Carga Segura Colombia',
          rut: '900123456-1',
          contact_name: 'Carlos Rodríguez',
          email: 'ventas@cargasegura.co',
          phone: '+573001234567',
          address: 'Calle 100 #15-20',
          country_id: paises.find(p => p.code === 'CO')?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Transporte Federal Argentina',
          rut: '30-12345678-9',
          contact_name: 'Ana Martínez',
          email: 'contacto@transfederal.ar',
          phone: '+541145678900',
          address: 'Av. Corrientes 2345',
          country_id: paises.find(p => p.code === 'AR')?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Envíos México Express',
          rut: 'EME123456ABC',
          contact_name: 'Roberto Sánchez',
          email: 'info@enviosmexico.mx',
          phone: '+525512345678',
          address: 'Av. Insurgentes Sur 890',
          country_id: paises.find(p => p.code === 'MX')?.id,
          is_active: true,
          organization_id: organizationId
        }
      ];

      const { data, error } = await supabase.from('carriers').insert(transportistas).select();
      if (error) throw error;

      updateResult('Transportistas', 'success', 'Transportistas insertados correctamente', transportistas.length);
      return data;
    } catch (error: any) {
      updateResult('Transportistas', 'error', error.message);
      throw error;
    }
  };

  const seedVehiculos = async (organizationId: string, transportistas: any[]) => {
    updateResult('Vehículos', 'loading', 'Insertando vehículos...');
    try {
      const vehiculos = [
        {
          plate: 'ABCD-12',
          type: 'Camión',
          brand: 'Mercedes-Benz',
          model: 'Actros 2546',
          year: 2022,
          max_weight: 25000,
          max_volume: 80,
          status: 'Disponible',
          carrier_id: transportistas[0]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'EFGH-34',
          type: 'Furgón',
          brand: 'Ford',
          model: 'Transit',
          year: 2021,
          max_weight: 3500,
          max_volume: 15,
          status: 'Disponible',
          carrier_id: transportistas[0]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'IJKL-56',
          type: 'Van',
          brand: 'Renault',
          model: 'Master',
          year: 2023,
          max_weight: 2500,
          max_volume: 12,
          status: 'Disponible',
          carrier_id: transportistas[1]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'MNOP-78',
          type: 'Camioneta',
          brand: 'Toyota',
          model: 'Hilux',
          year: 2022,
          max_weight: 1500,
          max_volume: 8,
          status: 'Disponible',
          carrier_id: transportistas[1]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'QRST-90',
          type: 'Camión',
          brand: 'Volvo',
          model: 'FH16',
          year: 2023,
          max_weight: 30000,
          max_volume: 90,
          status: 'Disponible',
          carrier_id: transportistas[2]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'UVWX-11',
          type: 'Furgón',
          brand: 'Chevrolet',
          model: 'N300',
          year: 2021,
          max_weight: 1200,
          max_volume: 10,
          status: 'Disponible',
          carrier_id: transportistas[2]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'YZAB-22',
          type: 'Van',
          brand: 'Peugeot',
          model: 'Boxer',
          year: 2022,
          max_weight: 3000,
          max_volume: 14,
          status: 'Disponible',
          carrier_id: transportistas[3]?.id,
          is_active: true,
          organization_id: organizationId
        },
        {
          plate: 'CDEF-33',
          type: 'Camioneta',
          brand: 'Nissan',
          model: 'Frontier',
          year: 2023,
          max_weight: 1800,
          max_volume: 9,
          status: 'Disponible',
          carrier_id: transportistas[4]?.id,
          is_active: true,
          organization_id: organizationId
        }
      ];

      const { error } = await supabase.from('vehicles').insert(vehiculos);
      if (error) throw error;

      updateResult('Vehículos', 'success', 'Vehículos insertados correctamente', vehiculos.length);
      return vehiculos;
    } catch (error: any) {
      updateResult('Vehículos', 'error', error.message);
      throw error;
    }
  };

  const seedConductores = async (organizationId: string, transportistas: any[]) => {
    updateResult('Conductores', 'loading', 'Insertando conductores...');
    try {
      const conductores = [
        {
          name: 'Pedro Ramírez',
          document_number: '12.345.678-9',
          phone: '+56987654321',
          email: 'pedro.ramirez@email.com',
          license_number: 'A1-123456',
          license_type: 'A1',
          license_expiry: '2026-12-31',
          carrier_id: transportistas[0]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Luis Fernández',
          document_number: '23.456.789-0',
          phone: '+56976543210',
          email: 'luis.fernandez@email.com',
          license_number: 'A2-234567',
          license_type: 'A2',
          license_expiry: '2025-08-15',
          carrier_id: transportistas[0]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Jorge Mendoza',
          document_number: '45678901',
          phone: '+51965432109',
          email: 'jorge.mendoza@email.com',
          license_number: 'AIII-345678',
          license_type: 'AIII',
          license_expiry: '2027-03-20',
          carrier_id: transportistas[1]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Miguel Torres',
          document_number: '56789012',
          phone: '+51954321098',
          email: 'miguel.torres@email.com',
          license_number: 'AIII-456789',
          license_type: 'AIII',
          license_expiry: '2026-06-10',
          carrier_id: transportistas[1]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Andrés Vargas',
          document_number: '1098765432',
          phone: '+573209876543',
          email: 'andres.vargas@email.com',
          license_number: 'C1-567890',
          license_type: 'C1',
          license_expiry: '2025-11-25',
          carrier_id: transportistas[2]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Ricardo Morales',
          document_number: '2109876543',
          phone: '+573198765432',
          email: 'ricardo.morales@email.com',
          license_number: 'C2-678901',
          license_type: 'C2',
          license_expiry: '2026-09-30',
          carrier_id: transportistas[2]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Fernando Castro',
          document_number: '34567890',
          phone: '+541156789012',
          email: 'fernando.castro@email.com',
          license_number: 'D1-789012',
          license_type: 'D1',
          license_expiry: '2027-01-15',
          carrier_id: transportistas[3]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        },
        {
          name: 'Javier Ruiz',
          document_number: 'RURJ850315ABC',
          phone: '+525567890123',
          email: 'javier.ruiz@email.com',
          license_number: 'E-890123',
          license_type: 'E',
          license_expiry: '2026-04-20',
          carrier_id: transportistas[4]?.id,
          status: 'Activo',
          is_active: true,
          organization_id: organizationId
        }
      ];

      const { error } = await supabase.from('drivers').insert(conductores);
      if (error) throw error;

      updateResult('Conductores', 'success', 'Conductores insertados correctamente', conductores.length);
      return conductores;
    } catch (error: any) {
      updateResult('Conductores', 'error', error.message);
      throw error;
    }
  };

  const seedTiendas = async (organizationId: string, paises: any[]) => {
    updateResult('Tiendas', 'loading', 'Insertando tiendas...');
    try {
      const tiendas = [
        {
          name: 'Centro de Distribución Santiago',
          code: 'CD-SCL-001',
          store_type: 'distribution_center',
          address: 'Av. Américo Vespucio 1501, Pudahuel',
          city: 'Santiago',
          state: 'Región Metropolitana',
          postal_code: '9020000',
          latitude: -33.4489,
          longitude: -70.6693,
          country_id: paises.find(p => p.code === 'CL')?.id,
          manager_name: 'Roberto Silva',
          phone: '+56223456789',
          email: 'cd.santiago@olo.cl',
          opening_hours: 'Lun-Vie 08:00-18:00, Sáb 09:00-14:00',
          capacity: 50000,
          area_m2: 8500,
          delivery_zone: 'Zona Metropolitana Santiago',
          is_origin: true,
          status: 'active',
          contact_name: 'Patricia Muñoz',
          contact_phone: '+56987654321',
          contact_email: 'pmuñoz@olo.cl',
          notes: 'Centro principal de distribución para toda la región metropolitana',
          organization_id: organizationId
        },
        {
          name: 'Bodega Valparaíso',
          code: 'BD-VAL-002',
          store_type: 'warehouse',
          address: 'Calle Errázuriz 890, Puerto',
          city: 'Valparaíso',
          state: 'Región de Valparaíso',
          postal_code: '2340000',
          latitude: -33.0472,
          longitude: -71.6127,
          country_id: paises.find(p => p.code === 'CL')?.id,
          manager_name: 'Patricia Muñoz',
          phone: '+56322345678',
          email: 'bodega.valpo@olo.cl',
          opening_hours: 'Lun-Vie 09:00-17:00',
          capacity: 15000,
          area_m2: 2500,
          delivery_zone: 'Valparaíso y Viña del Mar',
          is_origin: false,
          status: 'active',
          contact_name: 'Luis Contreras',
          contact_phone: '+56976543210',
          contact_email: 'lcontreras@olo.cl',
          notes: 'Bodega de apoyo para zona costera',
          organization_id: organizationId
        },
        {
          name: 'Centro Logístico Lima',
          code: 'CL-LIM-003',
          store_type: 'distribution_center',
          address: 'Av. Argentina 2345, Callao',
          city: 'Lima',
          state: 'Callao',
          postal_code: '07001',
          latitude: -12.0464,
          longitude: -77.0428,
          country_id: paises.find(p => p.code === 'PE')?.id,
          manager_name: 'Carmen Flores',
          phone: '+5114567890',
          email: 'cl.lima@olo.pe',
          opening_hours: 'Lun-Sáb 07:00-19:00',
          capacity: 45000,
          area_m2: 7200,
          delivery_zone: 'Lima Metropolitana y Callao',
          is_origin: true,
          status: 'active',
          contact_name: 'Jorge Mendoza',
          contact_phone: '+51987654321',
          contact_email: 'jmendoza@olo.pe',
          notes: 'Hub principal para operaciones en Perú',
          organization_id: organizationId
        },
        {
          name: 'Tienda Miraflores',
          code: 'TD-MIR-004',
          store_type: 'store',
          address: 'Av. Larco 1234, Miraflores',
          city: 'Lima',
          state: 'Lima',
          postal_code: '15074',
          latitude: -12.1196,
          longitude: -77.0303,
          country_id: paises.find(p => p.code === 'PE')?.id,
          manager_name: 'Ana Gutiérrez',
          phone: '+5114445566',
          email: 'tienda.miraflores@olo.pe',
          opening_hours: 'Lun-Dom 10:00-22:00',
          capacity: 5000,
          area_m2: 850,
          delivery_zone: 'Miraflores, San Isidro, Barranco',
          is_origin: false,
          status: 'active',
          contact_name: 'María Sánchez',
          contact_phone: '+51965432109',
          contact_email: 'msanchez@olo.pe',
          notes: 'Tienda retail con servicio de entrega express',
          organization_id: organizationId
        },
        {
          name: 'Almacén Bogotá Norte',
          code: 'AL-BOG-005',
          store_type: 'warehouse',
          address: 'Calle 170 #45-30, Usaquén',
          city: 'Bogotá',
          state: 'Cundinamarca',
          postal_code: '110111',
          latitude: 4.7110,
          longitude: -74.0721,
          country_id: paises.find(p => p.code === 'CO')?.id,
          manager_name: 'Diego Ramírez',
          phone: '+5716543210',
          email: 'almacen.bogota@olo.co',
          opening_hours: 'Lun-Vie 08:00-18:00, Sáb 09:00-13:00',
          capacity: 25000,
          area_m2: 4200,
          delivery_zone: 'Bogotá Norte y Chía',
          is_origin: true,
          status: 'active',
          contact_name: 'Andrés Vargas',
          contact_phone: '+573001234567',
          contact_email: 'avargas@olo.co',
          notes: 'Almacén estratégico para zona norte',
          organization_id: organizationId
        },
        {
          name: 'Depósito Buenos Aires',
          code: 'DP-BUE-006',
          store_type: 'warehouse',
          address: 'Av. General Paz 5678, Villa Lugano',
          city: 'Buenos Aires',
          state: 'CABA',
          postal_code: 'C1439',
          latitude: -34.6037,
          longitude: -58.3816,
          country_id: paises.find(p => p.code === 'AR')?.id,
          manager_name: 'Lucía Fernández',
          phone: '+541145678900',
          email: 'deposito.bsas@olo.ar',
          opening_hours: 'Lun-Vie 07:00-17:00',
          capacity: 30000,
          area_m2: 5500,
          delivery_zone: 'CABA y Gran Buenos Aires',
          is_origin: true,
          status: 'active',
          contact_name: 'Fernando Castro',
          contact_phone: '+541156789012',
          contact_email: 'fcastro@olo.ar',
          notes: 'Depósito principal para Argentina',
          organization_id: organizationId
        },
        {
          name: 'Hub Ciudad de México',
          code: 'HUB-MEX-007',
          store_type: 'distribution_center',
          address: 'Av. Insurgentes Norte 1234, Gustavo A. Madero',
          city: 'Ciudad de México',
          state: 'CDMX',
          postal_code: '07300',
          latitude: 19.4326,
          longitude: -99.1332,
          country_id: paises.find(p => p.code === 'MX')?.id,
          manager_name: 'Alejandro López',
          phone: '+525512345678',
          email: 'hub.cdmx@olo.mx',
          opening_hours: 'Lun-Sáb 06:00-20:00',
          capacity: 60000,
          area_m2: 9800,
          delivery_zone: 'CDMX y Área Metropolitana',
          is_origin: true,
          status: 'active',
          contact_name: 'Javier Ruiz',
          contact_phone: '+525567890123',
          contact_email: 'jruiz@olo.mx',
          notes: 'Hub de distribución más grande de la red',
          organization_id: organizationId
        },
        {
          name: 'Tienda Polanco',
          code: 'TD-POL-008',
          store_type: 'store',
          address: 'Av. Presidente Masaryk 456, Polanco',
          city: 'Ciudad de México',
          state: 'CDMX',
          postal_code: '11560',
          latitude: 19.4338,
          longitude: -99.1944,
          country_id: paises.find(p => p.code === 'MX')?.id,
          manager_name: 'Sofía Martínez',
          phone: '+525523456789',
          email: 'tienda.polanco@olo.mx',
          opening_hours: 'Lun-Dom 11:00-21:00',
          capacity: 3500,
          area_m2: 650,
          delivery_zone: 'Polanco, Lomas, Santa Fe',
          is_origin: false,
          status: 'active',
          contact_name: 'Carlos Hernández',
          contact_phone: '+525598765432',
          contact_email: 'chernandez@olo.mx',
          notes: 'Tienda premium con servicio personalizado',
          organization_id: organizationId
        }
      ];

      const { data, error } = await supabase.from('stores').insert(tiendas).select();
      if (error) throw error;

      updateResult('Tiendas', 'success', 'Tiendas insertadas correctamente', tiendas.length);
      return data;
    } catch (error: any) {
      updateResult('Tiendas', 'error', error.message);
      throw error;
    }
  };

  const seedRutas = async (organizationId: string, tiendas: any[], vehiculos: any[], conductores: any[], transportistas: any[]) => {
    updateResult('Rutas', 'loading', 'Insertando rutas...');
    try {
      const rutas = [
        {
          route_number: 'RT-2024-001',
          route_date: '2024-01-15',
          store_id: tiendas[0]?.id,
          driver_id: conductores[0]?.id,
          vehicle_id: vehiculos[0]?.id,
          carrier_id: transportistas[0]?.id,
          status: 'completed',
          total_stops: 8,
          completed_stops: 8,
          total_weight: 18500,
          total_volume: 65,
          total_distance: 145.5,
          notes: 'Ruta completada sin incidentes',
          organization_id: organizationId
        },
        {
          route_number: 'RT-2024-002',
          route_date: '2024-01-16',
          store_id: tiendas[1]?.id,
          driver_id: conductores[1]?.id,
          vehicle_id: vehiculos[1]?.id,
          carrier_id: transportistas[0]?.id,
          status: 'in_progress',
          total_stops: 5,
          completed_stops: 3,
          total_weight: 2800,
          total_volume: 12,
          total_distance: 78.3,
          notes: 'En progreso - 3 de 5 entregas completadas',
          organization_id: organizationId
        },
        {
          route_number: 'RT-2024-003',
          route_date: '2024-01-17',
          store_id: tiendas[2]?.id,
          driver_id: conductores[2]?.id,
          vehicle_id: vehiculos[2]?.id,
          carrier_id: transportistas[1]?.id,
          status: 'planned',
          total_stops: 6,
          completed_stops: 0,
          total_weight: 2100,
          total_volume: 10,
          total_distance: 92.7,
          notes: 'Ruta planificada para mañana',
          organization_id: organizationId
        },
        {
          route_number: 'RT-2024-004',
          route_date: '2024-01-14',
          store_id: tiendas[3]?.id,
          driver_id: conductores[4]?.id,
          vehicle_id: vehiculos[4]?.id,
          carrier_id: transportistas[2]?.id,
          status: 'completed',
          total_stops: 12,
          completed_stops: 12,
          total_weight: 24500,
          total_volume: 78,
          total_distance: 210.4,
          notes: 'Ruta larga completada exitosamente',
          organization_id: organizationId
        }
      ];

      const { error } = await supabase.from('routes').insert(rutas);
      if (error) throw error;

      updateResult('Rutas', 'success', 'Rutas insertadas correctamente', rutas.length);
      return rutas;
    } catch (error: any) {
      updateResult('Rutas', 'error', error.message);
      throw error;
    }
  };

  const executeSeed = async () => {
    if (!session?.user?.user_metadata?.organization_id) {
      alert('No se pudo obtener el ID de organización del usuario');
      return;
    }

    const organizationId = session.user.user_metadata.organization_id;

    setSeeding(true);
    setResults([]);

    try {
      // 1. Países
      const paises = await seedPaises(organizationId);

      // 2. Transportistas
      const transportistas = await seedTransportistas(organizationId, paises);

      // 3. Vehículos
      const vehiculos = await seedVehiculos(organizationId, transportistas);

      // 4. Conductores
      const conductores = await seedConductores(organizationId, transportistas);

      // 5. Tiendas
      const tiendas = await seedTiendas(organizationId, paises);

      // 6. Rutas
      await seedRutas(organizationId, tiendas, vehiculos, conductores, transportistas);

      alert('¡Seed completado exitosamente! Todos los datos de prueba han sido insertados.');
    } catch (error) {
      console.error('Error durante el seed:', error);
      alert('Hubo un error durante el proceso de seed. Revisa los resultados para más detalles.');
    } finally {
      setSeeding(false);
    }
  };

  const getStatusIcon = (status: SeedResult['status']) => {
    switch (status) {
      case 'pending':
        return <i className="ri-time-line text-slate-400 text-xl w-5 h-5 flex items-center justify-center"></i>;
      case 'loading':
        return <i className="ri-loader-4-line animate-spin text-blue-600 text-xl w-5 h-5 flex items-center justify-center"></i>;
      case 'success':
        return <i className="ri-checkbox-circle-fill text-emerald-600 text-xl w-5 h-5 flex items-center justify-center"></i>;
      case 'error':
        return <i className="ri-close-circle-fill text-red-600 text-xl w-5 h-5 flex items-center justify-center"></i>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Seed de Datos de Prueba</h1>
          <p className="text-sm text-slate-600 mt-1">Inserta datos de ejemplo en todos los módulos del sistema</p>
        </div>
      </div>

      <Card>
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <i className="ri-alert-line text-amber-600 text-xl w-5 h-5 flex items-center justify-center mt-0.5"></i>
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">Advertencia</h3>
                <p className="text-sm text-amber-800 mt-1">
                  Esta acción insertará datos de prueba en tu base de datos. Se recomienda usar solo en ambientes de desarrollo o pruebas.
                </p>
                <ul className="text-sm text-amber-800 mt-2 space-y-1 list-disc list-inside">
                  <li>5 países con información completa (bandera, capital, idioma, código telefónico, zona horaria)</li>
                  <li>5 transportistas con datos de contacto y ubicación</li>
                  <li>8 vehículos de diferentes tipos con capacidades</li>
                  <li>8 conductores asignados a transportistas con licencias</li>
                  <li>8 tiendas/bodegas/centros de distribución con coordenadas GPS, horarios, capacidad y contactos</li>
                  <li>4 rutas de ejemplo con diferentes estados</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <Button
              onClick={executeSeed}
              disabled={seeding}
              size="lg"
              icon={seeding ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-database-2-line"></i>}
            >
              {seeding ? 'Ejecutando Seed...' : 'Ejecutar Seed de Datos'}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900">Resultados:</h3>
              <div className="space-y-2">
                {results.map((result) => (
                  <div
                    key={result.module}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.status)}
                      <div>
                        <p className="font-medium text-slate-900">{result.module}</p>
                        <p className="text-sm text-slate-600">{result.message}</p>
                      </div>
                    </div>
                    {result.count !== undefined && (
                      <div className="text-sm font-semibold text-teal-600">
                        {result.count} registros
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900 mb-4">Información de los Datos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-global-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Países
            </h4>
            <p className="text-sm text-slate-600">Chile, Perú, Colombia, Argentina y México con banderas, capitales, idiomas, códigos telefónicos, monedas y zonas horarias.</p>
          </div>

          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-building-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Transportistas
            </h4>
            <p className="text-sm text-slate-600">5 empresas de transporte con información completa de contacto y ubicación por país.</p>
          </div>

          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-truck-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Vehículos
            </h4>
            <p className="text-sm text-slate-600">8 vehículos: camiones, furgones, vans y camionetas con capacidades de peso y volumen variadas.</p>
          </div>

          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-user-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Conductores
            </h4>
            <p className="text-sm text-slate-600">8 conductores con licencias válidas, contactos y asignados a diferentes transportistas.</p>
          </div>

          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-store-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Tiendas y Bodegas
            </h4>
            <p className="text-sm text-slate-600">8 ubicaciones (tiendas, bodegas y centros de distribución) con coordenadas GPS reales, horarios de operación, capacidad, área en m², zonas de entrega y contactos principales y secundarios.</p>
          </div>

          <div>
            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <i className="ri-route-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Rutas
            </h4>
            <p className="text-sm text-slate-600">4 rutas de ejemplo con diferentes estados: completadas, en progreso y planificadas, con información de distancia, peso y volumen.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}