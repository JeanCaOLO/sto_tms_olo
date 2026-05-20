import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  organizations: any;
  countries: any;
  stores: any;
  users: any;
  customers: any;
  carriers: any;
  drivers: any;
  vehicles: any;
  orders: any;
  order_items: any;
  routes: any;
  dispatch_guides: any;
  returns: any;
  rates: any;
  settlements: any;
  tracking_events: any;
};