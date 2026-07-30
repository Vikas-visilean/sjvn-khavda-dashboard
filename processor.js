/*
 * VisiLean raw API -> dashboard dataset processor.
 * Runs in Node (build-dashboard.js) and in the browser (live Refresh button).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.VLProc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // dd/mm/yyyy -> 'YYYY-MM-DD'
  function iso(s) {
    if (!s || !String(s).trim()) return null;
    const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  const STATUS = { 'Complete': 'C', 'Started': 'S', 'Not Committed': 'NC', 'Not Ready': 'NR' };
  const STEP = {
    'PR': 'pr',
    'Vendor Finalization': 'vf',
    'Purchase Order with Adv Payment': 'po',
    'Payment before dispatch': 'pay',
    'Material Manufacturing': 'mfg',
    'FAT / Inspection Call': 'fat',
    'MDCC': 'mdcc',
    'Material Dispatch & Receipt at Site': 'rec',
    'Execution': 'exec',
  };

  // Procurement package -> engineering groups + execution work packages (specific first)
  const MAP = [
    { m: 'PV Module', exec: ['Modules Strings'], eng: ['PV Module'] },
    { m: 'MMS Torqe', exec: ['Module Mouting Structure Installation'], eng: ['MMS Super Strucure Design'] },
    { m: 'MMS Coulmn', exec: ['MMS Pile Foundation', 'Module Mouting Structure Installation'], eng: ['MMS Column Design', 'MMS Pile Design'] },
    { m: 'MMS Child', exec: ['Module Mouting Structure Installation'], eng: ['MMS Super Strucure Design'] },
    { m: 'Inverter', exec: ['Inverter', 'Inverter & PLC Platform Construction'], eng: ['Inverter (GTP)'] },
    { m: '150 Kva Aux', exec: ['Aux Transformer'], eng: ['Aux Transformer'] },
    { m: 'Transformer', exec: ['IDT', 'IDT Foundation'], eng: ['IDT (GTP)', 'IDT Foundation Design'] },
    { m: '33 KV 3CX 500', exec: ['Plant to PSS 33KV Line', '33kV Line (Feeder to PSS)'], eng: ['33 HT Kv Cable'] },
    { m: '33 KV 300', exec: ['Cable Laying & Termination'], eng: ['33 HT Kv Cable'] },
    { m: 'HT Panel', exec: ['ICOG/RMU/VCB/HT Panel'], eng: ['ICOG/VCB/RMU/HT Panel'] },
    { m: '400 Sqmm DC Power', exec: ['Laying of DC Power Cable'], eng: ['DC Power Cable'] },
    { m: 'Solar String DC', exec: ['Laying of DC String Cable'], eng: ['DC String Cable'] },
    { m: 'ACDB Panel', exec: ['ACDB'], eng: ['ACDB/LT Panel/UPSDB'] },
    { m: 'UPS & Aux', exec: ['UPS', 'Battery'], eng: ['UPS & Battery'] },
    { m: 'SCB Structure', exec: ['SCB'], eng: ['SCB Structure & Foundation Design'] },
    { m: 'SCB', exec: ['SCB', 'String Combiner / Monitoring Box'], eng: ['SCB (GTP)'] },
    { m: 'SCADA', exec: ['SCADA PLC'], eng: ['SCADA & PPC'] },
    { m: 'CCTV', exec: ['Lights & Security Camera Installation'], eng: ['CCTV'] },
    { m: 'NIFPS', exec: ['NIFPS Foundation'], eng: ['NIFPS Design'] },
    { m: 'ESE LA', exec: ['LA (Lightening Arrestor)'], eng: ['LA (GTP)', 'LA Foundation'] },
    { m: 'Earthing Strip', exec: ['ICR Earthing Works'], eng: ['Earthing Material'] },
    { m: 'Robot Dry', exec: ['Dry Robotic Cleaning System', 'Docking Station'], eng: ['Robotic System', 'Robotics Foundation'] },
    { m: 'Pipeline Module', exec: ['Module Cleaning System (MCS)'], eng: ['Pipeline Based Module Cleaning System'] },
    { m: 'WMS', exec: ['WMS', 'WMS Installation'], eng: ['WMS (GTP)', 'WMS Foundation'] },
    { m: 'Boundary Fence', exec: ['ICR Fencing Works'], eng: ['Fencing Design'] },
    { m: 'DWC Conduits', exec: [], eng: ['Conduit for DC Cable'] },
    { m: 'Connector, Lug Gland', exec: ['Cable Laying & Termination'], eng: ['Lug & Gland', 'MC4 & Y Connector'] },
    { m: 'Control & Communication', exec: ['Cable Laying & Termination'], eng: ['Control Cable', 'Communication Cable'] },
    { m: 'LT Cable', exec: ['Cable Laying & Termination'], eng: ['LT Cable'] },
    { m: 'Street Light', exec: ['Lights & Security Camera Installation'], eng: ['Street Light Design'] },
  ];

  function buildData(tasks, constraintsRaw, now) {
    now = now || new Date();
    const byGuid = {};
    tasks.forEach(t => (byGuid[t.guid] = t));

    function chainOf(t) {
      const chain = [];
      let cur = t, hops = 0;
      while (cur && cur.parentGUID && hops < 25) {
        cur = byGuid[cur.parentGUID];
        if (cur) chain.unshift(cur);
        hops++;
      }
      return chain; // [root, ..., parent]
    }

    function feederOf(t, chain) {
      let m = (t.location || '').match(/Feeder\s*-?\s*(\d)/i);
      if (m) return 'F' + m[1];
      m = (t.taskName || '').match(/-\s*F(\d)\s*\)/);
      if (m) return 'F' + m[1];
      for (let i = chain.length - 1; i >= 1; i--) {
        const n = chain[i].taskName || '';
        m = n.match(/Feeder\s*-\s*(\d)/i) || n.match(/\(F(\d)\)/);
        if (m) return 'F' + m[1];
      }
      const all = (t.location || '') + '|' + (t.taskName || '') + '|' + chain.map(c => c.taskName).join('|');
      if (/MCR/.test(all)) return 'MCR';
      return 'CMN';
    }

    function resourceOf(t, chain, stage) {
      if (stage.startsWith('03')) {
        for (let i = 1; i < chain.length; i++) {
          if (/^Supply$/i.test(chain[i - 1].taskName || '') || /^Procurement$/i.test(chain[i - 1].taskName || '')) {
            if (/^Supply$/i.test(chain[i].taskName || '')) continue;
            return (chain[i].taskName || '').replace(/\s*\(SPLY\)\s*$/, '').trim();
          }
        }
      }
      if (stage.startsWith('02')) {
        const p = chain[chain.length - 1];
        return p ? p.taskName : '';
      }
      let m = (t.location || '').match(/(?:Feeder \d+|MCR)\s*-\s*(.+)/);
      if (m) return m[1].trim();
      const p = chain[chain.length - 1];
      return p ? (p.taskName || '').replace(/\s*\((F\d|MCR|CD|SPLY|GTP|DA)\)\s*$/, '').trim() : '';
    }

    // the feed contains duplicate rows (same taskId exported twice) — keep the first
    const seenIds = new Set();
    const leaves = tasks.filter(t => {
      if (t.parent) return false;
      const id = t.taskId || t.guid;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    const L = leaves.map(t => {
      const chain = chainOf(t);
      const stage = (t.customField || {})['Parent Task'] || (chain[1] ? chain[1].taskName : '') || 'Other';
      const tow = (t.customField || {})['Type of Work'] || '';
      const f = feederOf(t, chain);
      return {
        n: t.taskName || '',
        s: stage,
        w: STEP[tow] || (stage.startsWith('02') ? 'eng' : 'oth'),
        tw: tow,
        r: resourceOf(t, chain, stage),
        f,
        st: STATUS[t.status] || 'NR',
        pc: +t.percentComplete || 0,
        q: +t.totalQuantity || 0,
        aq: +t.actualQuantity || 0,
        u: t.quantityUnits || '',
        ps: iso(t.plannedStartDate),
        pe: iso(t.plannedEndDate),
        as: iso(t.actualStartDate),
        ae: iso(t.actualEndDate),
        cr: (t.customField || {})['Critical Activity'] === 'Yes' ? 1 : 0,
        o: t.owner || '',
        tr: t.trade || '',
      };
    });

    // ---------- Procurement tracker (Design -> Procurement -> Execution) ----------
    const procLeaves = L.filter(t => t.s.startsWith('03') && t.r);
    const resources = [...new Set(procLeaves.map(t => t.r))].sort();
    const engLeaves = L.filter(t => t.s.startsWith('02'));
    const execLeaves = L.filter(t => t.w === 'exec');

    function aggCell(items) {
      if (!items.length) return null;
      const units = [...new Set(items.map(i => i.u).filter(Boolean))];
      const mixed = units.length > 1;
      const q = mixed ? 0 : items.reduce((a, b) => a + b.q, 0);
      const aq = mixed ? 0 : items.reduce((a, b) => a + b.aq, 0);
      const pc = Math.round(items.reduce((a, b) => a + b.pc, 0) / items.length);
      const pe = items.map(i => i.pe).filter(Boolean).sort().slice(-1)[0] || null;
      const ps = items.map(i => i.ps).filter(Boolean).sort()[0] || null;
      let st = 'NR';
      if (items.every(i => i.st === 'C')) st = 'C';
      else if (items.some(i => i.st === 'S' || i.st === 'C' || i.pc > 0)) st = 'S';
      else if (items.some(i => i.st === 'NC')) st = 'NC';
      const u = mixed ? '' : (units[0] || '');
      return { st, pc, q: +q.toFixed(2), aq: +aq.toFixed(2), u, ps, pe, n: items.length };
    }

    const FEEDERS = ['F1', 'F2', 'F3', 'F4', 'MCR', 'CMN'];
    const tracker = resources.map(r => {
      const mine = procLeaves.filter(t => t.r === r);
      const map = MAP.find(x => r.includes(x.m));
      const engGroups = map ? engLeaves.filter(t => map.eng.some(k => (t.r || '').includes(k))) : [];
      const execPkgs = map ? execLeaves.filter(t => map.exec.some(k => t.r === k || (t.r || '').startsWith(k))) : [];
      const row = { name: r, feeders: {} };
      const steps = ['pr', 'vf', 'po', 'pay', 'mfg', 'fat', 'mdcc', 'rec'];
      const cellsAll = { eng: aggCell(engGroups) };
      steps.forEach(s => (cellsAll[s] = aggCell(mine.filter(t => t.w === s))));
      cellsAll.exec = aggCell(execPkgs);
      row.feeders.ALL = cellsAll;
      FEEDERS.forEach(f => {
        const fm = mine.filter(t => t.f === f);
        const fe = execPkgs.filter(t => t.f === f);
        if (!fm.length && !fe.length) return;
        const c = { eng: null };
        steps.forEach(s => {
          c[s] = aggCell(fm.filter(t => t.w === s));
          if (!c[s] && cellsAll[s] && ['pr', 'vf', 'po'].includes(s)) c[s] = Object.assign({}, cellsAll[s], { inh: 1 });
        });
        c.exec = aggCell(fe);
        row.feeders[f] = c;
      });
      return row;
    });

    // ---------- constraints ----------
    const constraints = (constraintsRaw || []).map(c => ({
      title: c.title, cat: c.category, pri: c.priority, owner: c.owner,
      org: c.ownerOrganisation, author: c.author,
      created: iso(c.creationDate), target: iso(c.targetDate),
      committed: iso(c.commitmentDate), done: iso(c.completionDate),
    }));

    return {
      project: '200MW SJVN Solar Plant Khavda - KP (Plot 1)',
      capacityMW: 200,
      asOf: now.toISOString().slice(0, 10),
      generatedAt: now.toISOString(),
      tasks: L,
      tracker,
      constraints,
    };
  }

  return { buildData: buildData, iso: iso };
});
