import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10Znlla2R4dGtkaWFxYmdhb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjA2NDAsImV4cCI6MjA4OTU5NjY0MH0.02uXvFMvloJ64E7qH1YgU-zB9E4EsfQGO0dV9GZE8PY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});