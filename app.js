/**
 * Finiquito — Calculadora de Indemnización Chile
 * Pure client-side severance pay calculator.
 * No build step, no server, no dependencies.
 */

// ── DOM references ──
const $ = (sel) => document.querySelector(sel);

const inputRefs = {
  netSalary:    $('#net-salary'),
  yearsService: $('#years-service'),
  vacationDays: $('#vacation-days'),
  ufValue:      $('#uf-value'),
};

// ── State ──
let ufValue = 39740;       // default fallback
let ufDate = '';

// ── Currency ──
function fmtCLP(n) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

// ── Causal rules ──
// Each causal has a base multiplier for the indemnización
// and an optional recargo if declared unjustified (Art. 168 CT)
const CAUSAL_RULES = {
  'art161':   { base: 1.0, recargo: 0.3, label: 'Art. 161', desc: 'Indemnización completa (30 días por año, tope 90 UF)' },
  'art159-1': { base: 0,   recargo: 0,   label: 'Art. 159 N°1', desc: 'Mutuo acuerdo: sin indemnización legal' },
  'art159-2': { base: 0,   recargo: 0,   label: 'Art. 159 N°2', desc: 'Renuncia voluntaria: sin indemnización legal' },
  'art160':   { base: 0,   recargo: 0.5, label: 'Art. 160', desc: 'Despido disciplinario: sin indemnización, salvo declaración judicial' },
};

// ── Core calculation ──
function calculate() {
  const netSalary    = parseFloat(inputRefs.netSalary.value) || 0;
  const yearsService = parseFloat(inputRefs.yearsService.value) || 0;
  const vacationDays = parseFloat(inputRefs.vacationDays.value) || 0;
  const uf           = parseFloat(inputRefs.ufValue.value) || ufValue;

  if (netSalary <= 0 && yearsService <= 0 && vacationDays <= 0) {
    $('.results-section').hidden = true;
    return;
  }

  // Causal logic
  const causal = $('#causal-select').value;
  const rule = CAUSAL_RULES[causal];
  const injustificado = $('#injustificado-check').checked;

  // Indemnización base (30d × years), with 90 UF cap
  const tope90UF = 90 * uf;
  const cappedMonthly = Math.min(netSalary, tope90UF);
  const indemBase = cappedMonthly * yearsService * rule.base;

  // Recargo if declared unjustified
  const recargoPct = (injustificado && rule.recargo > 0) ? rule.recargo : 0;
  const recargoMonto = indemBase * recargoPct;
  const indemnizacion = indemBase + recargoMonto;

  // Vacaciones: días × (sueldo / 30)
  const dailySalary = netSalary / 30;
  const vacaciones = vacationDays * dailySalary;

  const total = indemnizacion + vacaciones;

  // ── Display results ──
  const causalLabel = rule.label;

  if (rule.base === 0 && indemnizacion === 0) {
    $('#res-indemnizacion').textContent = 'No aplica';
    $('#res-tope-uf').textContent       = `${rule.desc}`;
  } else {
    $('#res-indemnizacion').textContent = fmtCLP(indemnizacion);
    const topeText = netSalary > tope90UF
      ? `Sueldo topado a 90 UF (${fmtCLP(tope90UF)})`
      : `Sin tope (90 UF = ${fmtCLP(tope90UF)})`;
    if (recargoPct > 0) {
      $('#res-tope-uf').textContent = topeText + ` + recargo ${Math.round(recargoPct*100)}% (injustificado)`;
    } else {
      $('#res-tope-uf').textContent = topeText;
    }
  }

  $('#res-vacaciones').textContent = fmtCLP(vacaciones);
  $('#res-valor-dia').textContent  = fmtCLP(dailySalary);
  $('#res-total').textContent      = fmtCLP(total);

  // ── Breakdown ──
  $('#bd-sueldo').textContent        = fmtCLP(netSalary);
  $('#bd-anos').textContent          = yearsService.toLocaleString('es-CL', {maximumFractionDigits: 1});
  $('#bd-dias').textContent          = Math.round(vacationDays).toString();
  $('#bd-uf').textContent            = fmtCLP(uf);
  $('#bd-tope').textContent          = fmtCLP(tope90UF);

  if (rule.base === 0) {
    $('#bd-sueldo-topado').textContent = rule.desc;
    $('#bd-multiplicador').textContent = '—';
    $('#bd-sub-indem').textContent     = fmtCLP(0);
  } else {
    $('#bd-sueldo-topado').textContent = fmtCLP(cappedMonthly);
    $('#bd-multiplicador').textContent = '× ' + yearsService.toLocaleString('es-CL', {maximumFractionDigits: 1});
    if (recargoPct > 0) {
      $('#bd-sub-indem').textContent = fmtCLP(indemBase) + ' + ' + fmtCLP(recargoMonto) + ' (' + Math.round(recargoPct*100) + '%)';
    } else {
      $('#bd-sub-indem').textContent = fmtCLP(indemBase);
    }
  }

  $('#bd-diario').textContent        = fmtCLP(dailySalary);
  $('#bd-dias-pend').textContent     = '× ' + Math.round(vacationDays).toString();
  $('#bd-sub-vac').textContent       = fmtCLP(vacaciones);
  $('#bd-total').textContent         = fmtCLP(total);

  // Show results
  $('.results-section').hidden = false;
}

// ── Causal change handler ──
function updateCausalUI() {
  const causal = $('#causal-select').value;
  const rule = CAUSAL_RULES[causal];

  // Show/hide unjustified checkbox based on whether recargo exists
  const grupo = $('#injustificado-group');
  const note = $('#causal-note');

  if (rule.recargo > 0) {
    grupo.hidden = false;
    note.textContent = `Recargo del ${Math.round(rule.recargo * 100)}% sobre indemnización base si el tribunal declara el despido injustificado (Art. 168 CT).`;
  } else {
    grupo.hidden = true;
    $('#injustificado-check').checked = false;
  }

  calculate();
}

// ── UF fetch ──
async function fetchUF() {
  try {
    const resp = await fetch('https://mindicador.cl/api/uf');
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    if (data.serie && data.serie.length > 0) {
      ufValue = data.serie[0].valor;
      const d = new Date(data.serie[0].fecha);
      ufDate = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch (e) {
    console.warn('Could not fetch UF, using default', ufValue);
    ufDate = 'valor por defecto';
  }

  inputRefs.ufValue.value = Math.round(ufValue).toString();
  $('#rate-value').textContent = `$${ufValue.toLocaleString('es-CL', {maximumFractionDigits: 2})} CLP`;
  $('#rate-date').textContent  = `(${ufDate})`;
  $('#rate-info').hidden = false;

  // Recalculate if user already entered data before UF arrived
  calculate();
}

// ── Event handlers ──
Object.values(inputRefs).forEach(el => {
  el.addEventListener('input', calculate);
});

$('#causal-select').addEventListener('change', updateCausalUI);
$('#injustificado-check').addEventListener('change', calculate);

// ── Init ──
(async function init() {
  await fetchUF();
  updateCausalUI();
})();