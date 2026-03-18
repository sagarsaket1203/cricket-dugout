import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xkttmtmiuxjglygoubyi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_MgiIK3gJfsv_N1iUmz3bIw_cobNjWOO'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
