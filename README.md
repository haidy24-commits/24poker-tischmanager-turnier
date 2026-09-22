# 24Poker Turniermanager

Eigenständige Multiuser-Web-App für 13 Turniertische A–M. Die App läuft ohne Login und synchronisiert Tischgrößen, Aktivierung, Re-Entry-Status, Busts, Drag-and-drop und den Re-Entry-Gesamtzähler in Echtzeit über ein eigenes Supabase-Projekt.

Alle Tische starten standardmäßig 9-handed und können einzeln auf 10-handed umgeschaltet werden.

Diese Anwendung ist technisch vollständig vom Sit-&-Go-Manager getrennt.

## Bereitstellung

- GitHub Pages: statische Dateien im Repository
- Supabase: `supabase/schema.sql` einmal im SQL Editor ausführen
- Browserzugriff: öffentlicher Publishable Key, abgesichert durch RLS und ausschließlich freigegebene RPC-Funktionen
