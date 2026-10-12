(() => {
  'use strict';
  const letters = 'ABCDEFGHIJKLM'.split('');
  const room = document.getElementById('room');
  const tableSwitches = document.getElementById('table-switches');
  const notice = document.getElementById('notice');
  const config = window.TOURNAMENT_SUPABASE;
  const cloud = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let data = { seats: {}, modes: {}, enabled: {}, reentryTotal: 0 };
  let viewMode = localStorage.getItem('24poker-tournament-view') === 'compact' ? 'compact' : 'room';
  let drag = null, suppressClickSeat = null, suppressClickUntil = 0, reloadTimer = null, busy = false;
  const seatKey = (table, seat) => `${table}-${seat}`;
  const modeFor = table => Number(data.modes[table]) === 10 ? 10 : 9;
  const enabledFor = table => data.enabled[table] !== false;
  const orientationFor = table => ({ A:'right',B:'left',C:'top',D:'top',E:'right',F:'top',G:'top',H:'bottom',I:'bottom',J:'top',K:'right',L:'right',M:'left' })[table] || 'top';
  const roomLayoutActive = () => viewMode === 'room' && window.matchMedia('(min-width:1100px)').matches;
  const firstSeatAngle = table => roomLayoutActive() ? ({ right:30,left:-150,bottom:120,top:-60 })[orientationFor(table)] : -60;
  function setNotice(text, restore = true) { notice.textContent = text; if (restore) setTimeout(() => { notice.textContent = 'Live verbunden · Änderungen erscheinen automatisch auf allen Geräten.'; }, 2200); }

  async function loadDatabase(showReady = false) {
    const [tablesResult, seatsResult, metaResult] = await Promise.all([
      cloud.from('tournament_tables').select('*').order('table_id'),
      cloud.from('tournament_seats').select('*'),
      cloud.from('tournament_meta').select('reentry_total').eq('id', 1).single()
    ]);
    const error = tablesResult.error || seatsResult.error || metaResult.error;
    if (error) { console.error(error); setNotice('Keine Verbindung zur Turnierdatenbank. Bitte Internetverbindung prüfen.', false); return; }
    data = { seats: {}, modes: {}, enabled: {}, reentryTotal: Number(metaResult.data.reentry_total) || 0 };
    tablesResult.data.forEach(row => { data.modes[row.table_id] = row.mode; data.enabled[row.table_id] = row.enabled; });
    seatsResult.data.forEach(row => { data.seats[seatKey(row.table_id, row.seat_no)] = row.state; });
    render();
    if (showReady) setNotice('Live verbunden · Änderungen erscheinen automatisch auf allen Geräten.', false);
  }
  function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => loadDatabase(false), 100); }

  function makeCard(letter) {
    const card = document.createElement('section'); card.className = `table-card orientation-${orientationFor(letter)}`; card.dataset.table = letter;
    card.innerHTML = `<div class="table-head"><div><div class="table-name">Tisch ${letter}</div><div class="table-meta"></div></div><div class="head-actions"><button type="button" class="table-power on" aria-label="Tisch ${letter} ein- oder ausschalten">Ein</button><div class="mode" role="group" aria-label="Plätze an Tisch ${letter}"><button type="button" data-mode="9">9</button><button type="button" data-mode="10">10</button></div><button type="button" class="reset-table" aria-label="Tisch ${letter} zurücksetzen">Reset</button></div></div><div class="board"><div class="felt"><div class="felt-letter">${letter}</div><div class="felt-label">TISCH</div></div><div class="dealer" aria-label="Fiktiver Dealerplatz, nicht anklickbar"><strong>D</strong><span>DEALER</span></div></div>`;
    const board = card.querySelector('.board');
    for (let n = 1; n <= 10; n++) {
      const seat = document.createElement('button'); seat.type = 'button'; seat.className = `seat p${n}`; seat.dataset.table = letter; seat.dataset.seat = String(n);
      seat.innerHTML = `<span class="seat-no">${n}</span><span class="state-label"></span>`; seat.addEventListener('click', () => cycleSeat(seat)); board.appendChild(seat);
    }
    card.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setTable(letter, Number(button.dataset.mode), enabledFor(letter))));
    card.querySelector('.table-power').addEventListener('click', () => setTable(letter, modeFor(letter), !enabledFor(letter)));
    card.querySelector('.reset-table').addEventListener('click', async () => {
      if (!confirm(`Tisch ${letter} wirklich zurücksetzen? Der Re-Entry-Gesamtzähler bleibt erhalten.`)) return;
      await callRpc('reset_tournament_table', { p_table: letter }, `Tisch ${letter} wurde zurückgesetzt.`);
    }); room.appendChild(card);
  }

  async function cycleSeat(seat) {
    if (busy || (suppressClickSeat === seat && performance.now() < suppressClickUntil)) { suppressClickSeat = null; return; }
    const state = Number(seat.dataset.state) || 0;
    if (state === 2 && !confirm('Player Bust? Der Platz wird wieder freigegeben.')) return;
    busy = true; const { error } = await cloud.rpc('cycle_tournament_seat', { p_table: seat.dataset.table, p_seat: Number(seat.dataset.seat) }); busy = false;
    if (error) return setNotice(`Änderung nicht gespeichert: ${error.message}`);
    if (state === 2) setNotice(`Player Bust an Tisch ${seat.dataset.table}, Platz ${seat.dataset.seat}. Der Platz ist wieder frei.`);
    await loadDatabase(false);
  }
  async function setTable(table, mode, enabled) {
    if (busy) return; busy = true; const { error } = await cloud.rpc('set_tournament_table', { p_table: table, p_mode: mode, p_enabled: enabled }); busy = false;
    if (error) return setNotice(`Tischeinstellung nicht gespeichert: ${error.message}`); await loadDatabase(false);
  }
  async function callRpc(name, params, successText) {
    if (busy) return; busy = true; const { error } = await cloud.rpc(name, params); busy = false;
    if (error) return setNotice(`Änderung nicht gespeichert: ${error.message}`); if (successText) setNotice(successText); await loadDatabase(false);
  }
  letters.forEach(makeCard);
  letters.forEach(letter => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'table-switch'; button.dataset.tableSwitch = letter;
    button.textContent = letter; button.setAttribute('aria-label', `Tisch ${letter} anzeigen oder ausblenden`);
    button.addEventListener('click', () => setTable(letter, modeFor(letter), !enabledFor(letter)));
    tableSwitches.appendChild(button);
  });
  document.querySelectorAll('[data-view-mode]').forEach(button => button.addEventListener('click', () => {
    viewMode = button.dataset.viewMode; localStorage.setItem('24poker-tournament-view', viewMode); render();
  }));

  const clearDropMarks = () => room.querySelectorAll('.drop-target,.drop-blocked').forEach(el => el.classList.remove('drop-target', 'drop-blocked'));
  function targetAt(x, y, source) { const hit = document.elementFromPoint(x, y), seat = hit && hit.closest('.seat'); return seat && seat !== source && !seat.classList.contains('hidden') && !seat.disabled ? seat : null; }
  function beginDrag(source, event) {
    drag.dragging = true; source.classList.add('dragging'); document.body.classList.add('is-dragging');
    const ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.dataset.state = source.dataset.state; ghost.innerHTML = source.innerHTML; document.body.appendChild(ghost); drag.ghost = ghost; moveGhost(event.clientX, event.clientY);
  }
  function moveGhost(x, y) {
    if (!drag?.ghost) return; drag.ghost.style.left = `${x}px`; drag.ghost.style.top = `${y}px`; clearDropMarks(); const target = targetAt(x, y, drag.source); drag.target = target;
    if (target) target.classList.add(Number(target.dataset.state) === 0 ? 'drop-target' : 'drop-blocked');
  }
  async function finishDrag(event) {
    if (!drag) return; const current = drag;
    if (current.dragging) {
      event.preventDefault(); suppressClickSeat = current.source; suppressClickUntil = performance.now() + 500; moveGhost(event.clientX, event.clientY); const target = current.target;
      if (target && Number(target.dataset.state) === 0) {
        const { error } = await cloud.rpc('move_tournament_reentry', { p_source_table: current.source.dataset.table, p_source_seat: Number(current.source.dataset.seat), p_target_table: target.dataset.table, p_target_seat: Number(target.dataset.seat) });
        setNotice(error ? `Re-Entry nicht verschoben: ${error.message}` : `Re-Entry nach Tisch ${target.dataset.table}, Platz ${target.dataset.seat} verschoben.`);
      } else setNotice(target ? 'Zielplatz ist bereits belegt.' : 'Re-Entry wurde nicht verschoben.');
    }
    current.source.classList.remove('dragging'); current.ghost?.remove(); clearDropMarks(); document.body.classList.remove('is-dragging'); drag = null; await loadDatabase(false);
  }
  room.addEventListener('pointerdown', event => { const source = event.target.closest('.seat'); if (!source || source.disabled || Number(source.dataset.state) === 0) return; drag = { source, startX: event.clientX, startY: event.clientY, dragging: false, target: null, ghost: null, pointerId: event.pointerId }; source.setPointerCapture(event.pointerId); });
  room.addEventListener('pointermove', event => { if (!drag || event.pointerId !== drag.pointerId) return; if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) beginDrag(drag.source, event); if (drag.dragging) { event.preventDefault(); moveGhost(event.clientX, event.clientY); } });
  room.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.pointerId) finishDrag(event); });
  room.addEventListener('pointercancel', event => { if (drag && event.pointerId === drag.pointerId) finishDrag(event); });

  function render() {
    let yellow = 0, red = 0, total = 0;
    room.classList.toggle('compact-view', !roomLayoutActive());
    document.querySelectorAll('[data-view-mode]').forEach(button => { const active = button.dataset.viewMode === viewMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    letters.forEach(letter => {
      const card = room.querySelector(`[data-table="${letter}"]`), mode = modeFor(letter), enabled = enabledFor(letter); let y = 0, r = 0;
      card.hidden = !enabled;
      const switchButton = tableSwitches.querySelector(`[data-table-switch="${letter}"]`);
      switchButton.classList.toggle('active', enabled); switchButton.setAttribute('aria-pressed', String(enabled));
      const power = card.querySelector('.table-power'); power.textContent = 'Ausblenden'; power.classList.add('on'); power.classList.remove('off'); power.setAttribute('aria-pressed', String(enabled));
      card.querySelectorAll('[data-mode]').forEach(button => { const active = Number(button.dataset.mode) === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
      card.querySelectorAll('.seat').forEach(seat => {
        const n = Number(seat.dataset.seat), hidden = n > mode, state = Math.max(0, Math.min(2, Number(data.seats[seatKey(letter, n)]) || 0));
        seat.classList.toggle('hidden', hidden); seat.disabled = !enabled; seat.dataset.state = String(state); seat.querySelector('.state-label').textContent = state === 1 ? 'RE-ENTRY 1' : state === 2 ? 'RE-ENTRY 2' : '';
        seat.setAttribute('aria-label', `Tisch ${letter}, Platz ${n}, ${state === 0 ? 'frei' : state === 1 ? 'Re-Entry 1' : 'Re-Entry 2'}`);
        if (!hidden) { const angle = (firstSeatAngle(letter) + (300 / (mode - 1)) * (n - 1)) * Math.PI / 180; seat.style.left = `${50 + 43 * Math.cos(angle)}%`; seat.style.top = `${51 + 43 * Math.sin(angle)}%`; if (enabled) { total++; if (state === 1) { yellow++; y++; } if (state === 2) { red++; r++; } } }
      });
      card.querySelector('.table-meta').textContent = `${mode}-handed · ${mode - y - r} frei · ${y} RE1 · ${r} RE2`;
    });
    document.getElementById('free-count').textContent = `Frei: ${total - yellow - red}`; document.getElementById('reentry-total').textContent = `Re-Entry total: ${data.reentryTotal}`; document.getElementById('yellow-count').textContent = `Re-Entry 1: ${yellow}`; document.getElementById('red-count').textContent = `Re-Entry 2: ${red}`;
  }
  document.getElementById('reset-all').addEventListener('click', async () => { if (!confirm('Alle Plätze und den Re-Entry-Gesamtzähler für alle Geräte zurücksetzen?')) return; await callRpc('reset_tournament_all', {}, 'Alle Plätze und der Re-Entry-Gesamtzähler wurden zurückgesetzt.'); });
  window.addEventListener('resize', render);
  cloud.channel('turnier-live').on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_tables' }, scheduleReload).on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_seats' }, scheduleReload).on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_meta' }, scheduleReload).subscribe(status => { if (status === 'SUBSCRIBED') setNotice('Live verbunden · Änderungen erscheinen automatisch auf allen Geräten.', false); });
  loadDatabase(true);
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
})();
