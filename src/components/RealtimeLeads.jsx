import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function useRealtimeLeads(onNewLead) {
  useEffect(() => {
    console.log('🔌 Setting up realtime listener...');
    
    const channel = supabase
      .channel('webinar-leads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
          filter: 'pipeline=eq.Webinar'
        },
        (payload) => {
          console.log('🔔 New lead!', payload.new);
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🔔 New Webinar Lead!', {
              body: `${payload.new.name} - ${payload.new.phone}`,
              icon: '/favicon.ico'
            });
          }
          
          if (onNewLead) {
            onNewLead(payload.new);
          }
        }
      )
      .subscribe();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNewLead]);
}
