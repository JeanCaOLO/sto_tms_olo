import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const [, , email, password, fullName] = process.argv;
if (!email || !password || !fullName) {
  console.error('Usage: node scripts/create-dev-user.mjs <email> <password> "<full name>"');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim().replace(/^"|"$/g, ''))),
);

const supabase = createClient(env.VITE_PUBLIC_SUPABASE_URL, env.VITE_PUBLIC_SUPABASE_ANON_KEY);

const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
const { data: role } = await supabase.from('roles').select('id').eq('name', 'SuperUsuario').single();

const { data: authData, error: authError } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: fullName } },
});
if (authError) {
  console.error('auth.signUp error:', authError.message);
  process.exit(1);
}
console.log('auth user created:', authData.user?.id, '- session:', authData.session ? 'active' : 'null (email confirmation required?)');

const { error: insertError } = await supabase.from('app_users').insert({
  auth_user_id: authData.user.id,
  organization_id: org.id,
  full_name: fullName,
  email,
  role_id: role.id,
  status: 'active',
});
if (insertError) {
  console.error('app_users insert error:', insertError.message);
  process.exit(1);
}
console.log('app_users row created. Login with:', email, '/', password);
