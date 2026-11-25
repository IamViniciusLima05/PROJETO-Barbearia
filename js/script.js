/* ==========================================================
   Navalha Barbearia — sistema de agendamento
   HTML + CSS + JavaScript puro. Os agendamentos ficam salvos
   no localStorage do navegador (sem servidor).
   ========================================================== */

// ---------- Configuração da barbearia ----------
const WHATSAPP_BARBEARIA = '5551999999999'; // troque pelo número real (DDI + DDD + número)

const SERVICOS = [
  { id: 'corte',     nome: 'Corte',             desc: 'Tesoura ou máquina',          min: 30, preco: 45 },
  { id: 'barba',     nome: 'Barba',             desc: 'Toalha quente e navalha',     min: 30, preco: 35 },
  { id: 'combo',     nome: 'Corte + Barba',     desc: 'O clássico completo',         min: 60, preco: 70 },
  { id: 'infantil',  nome: 'Corte infantil',    desc: 'Até 12 anos',                 min: 30, preco: 35 },
  { id: 'pigmento',  nome: 'Pigmentação',       desc: 'Barba ou cabelo',             min: 30, preco: 30 },
  { id: 'platinado', nome: 'Luzes / Platinado', desc: 'Inclui tonalizante',          min: 90, preco: 120 }
];

const BARBEIROS = [
  { id: 'qualquer', nome: 'Sem preferência', esp: 'O primeiro livre', cor: '#6b716e' },
  { id: 'rafael',   nome: 'Rafael',          esp: 'Degradê e navalhado', cor: '#12403a' },
  { id: 'thiago',   nome: 'Thiago',          esp: 'Barba e toalha quente', cor: '#c8323c' },
  { id: 'lucas',    nome: 'Lucas',           esp: 'Corte clássico', cor: '#1f4e8c' }
];

const ABERTURA = 9;      // 9h
const FECHAMENTO = 20;   // 20h
const INTERVALO = 30;    // minutos por slot
const DIAS_A_FRENTE = 14;
const DIAS_FECHADOS = [0]; // 0 = domingo

// ---------- Utilitários ----------
const $ = (sel) => document.querySelector(sel);
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = (n) => String(n).padStart(2, '0');
const chaveData = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deChave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d); };
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SLOTS = [];
for (let m = ABERTURA * 60; m < FECHAMENTO * 60; m += INTERVALO) SLOTS.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

const armazenamento = {
  ler() { try { return JSON.parse(localStorage.getItem('navalha_agendamentos')) || []; } catch { return []; } },
  salvar(lista) { try { localStorage.setItem('navalha_agendamentos', JSON.stringify(lista)); } catch { /* sem storage */ } }
};
let agendamentos = armazenamento.ler();

// Horários "marcados por telefone" para a demonstração parecer real.
// Gera sempre o mesmo resultado para o mesmo barbeiro/dia/horário.
function hash(texto) {
  // FNV-1a com mistura final: espalha bem os valores
  let h = 2166136261;
  for (const c of texto) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
function ocupadoPorTelefone(barbeiro, data, slot) {
  return hash(barbeiro + data + slot) % 100 < 22;
}

function slotOcupado(barbeiro, data, indice) {
  const slot = SLOTS[indice];
  if (ocupadoPorTelefone(barbeiro, data, slot)) return true;
  return agendamentos.some((a) => {
    if (a.barbeiro !== barbeiro || a.data !== data) return false;
    const ini = SLOTS.indexOf(a.hora);
    return indice >= ini && indice < ini + a.duracao / INTERVALO;
  });
}

function barbeiroLivre(barbeiro, data, inicio, qtd) {
  if (inicio + qtd > SLOTS.length) return false;
  for (let i = inicio; i < inicio + qtd; i++) if (slotOcupado(barbeiro, data, i)) return false;
  return true;
}

function primeiroBarbeiroLivre(data, inicio, qtd) {
  return BARBEIROS.slice(1).find((b) => barbeiroLivre(b.id, data, inicio, qtd));
}

// ---------- Estado da tela ----------
const estado = { servicos: [], barbeiro: 'qualquer', data: null, hora: null };

const duracaoTotal = () => estado.servicos.reduce((s, id) => s + SERVICOS.find((x) => x.id === id).min, 0);
const precoTotal = () => estado.servicos.reduce((s, id) => s + SERVICOS.find((x) => x.id === id).preco, 0);
const formatarDuracao = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ''}` : `${min} min`);

// ---------- Renderização: serviços ----------
function renderServicos() {
  $('#lista-servicos').innerHTML = SERVICOS.map((s) => `
    <label class="servico">
      <input type="checkbox" name="servico" value="${s.id}">
      <b>${s.nome}</b>
      <small>${s.desc} · ${formatarDuracao(s.min)}</small>
      <span class="preco">${brl(s.preco)}</span>
    </label>`).join('');
}

// ---------- Renderização: barbeiros ----------
function renderBarbeiros() {
  $('#lista-barbeiros').innerHTML = BARBEIROS.map((b) => `
    <label class="barbeiro">
      <input type="radio" name="barbeiro" value="${b.id}" ${b.id === estado.barbeiro ? 'checked' : ''}>
      <span class="avatar" style="background:${b.cor}">${b.id === 'qualquer' ? '?' : b.nome[0]}</span>
      <span><b>${b.nome}</b><small>${b.esp}</small></span>
    </label>`).join('');
}

// ---------- Renderização: dias ----------
function renderDias() {
  const hoje = new Date();
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  let html = '';
  for (let i = 0; i < DIAS_A_FRENTE; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    const k = chaveData(d);
    const fechado = DIAS_FECHADOS.includes(d.getDay()) || (i === 0 && hoje.getHours() >= FECHAMENTO - 1);
    if (!estado.data && !fechado) estado.data = k;
    html += `<button type="button" class="dia ${estado.data === k ? 'ativo' : ''}" data-dia="${k}" ${fechado ? 'disabled' : ''}
      aria-label="${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}${fechado ? ', fechado' : ''}">
      <span>${i === 0 ? 'hoje' : semana[d.getDay()]}</span><strong>${pad(d.getDate())}</strong><span>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
    </button>`;
  }
  $('#dias').innerHTML = html;
}

// ---------- Renderização: horários ----------
function renderHorarios() {
  const alvo = $('#horarios');
  if (!estado.servicos.length) { alvo.innerHTML = '<p class="vazio">Escolha pelo menos um serviço para ver os horários.</p>'; return; }
  if (!estado.data) { alvo.innerHTML = '<p class="vazio">Escolha um dia.</p>'; return; }

  const qtd = duracaoTotal() / INTERVALO;
  const agora = new Date();
  const ehHoje = estado.data === chaveData(agora);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  let livres = 0;
  const html = SLOTS.map((slot, i) => {
    const [h, m] = slot.split(':').map(Number);
    const passou = ehHoje && h * 60 + m <= minutosAgora + 15;
    const livre = !passou && (estado.barbeiro === 'qualquer'
      ? Boolean(primeiroBarbeiroLivre(estado.data, i, qtd))
      : barbeiroLivre(estado.barbeiro, estado.data, i, qtd));
    if (livre) livres++;
    if (!livre && estado.hora === slot) estado.hora = null;
    return `<button type="button" class="horario ${estado.hora === slot ? 'ativo' : ''}" data-hora="${slot}" ${livre ? '' : 'disabled'}>${slot}</button>`;
  }).join('');

  alvo.innerHTML = livres ? html : '<p class="vazio">Nenhum horário livre neste dia. Tente outro dia ou outro barbeiro.</p>';
}

// ---------- Resumo ----------
function renderResumo() {
  const nomes = estado.servicos.map((id) => SERVICOS.find((s) => s.id === id).nome);
  $('#r-servicos').textContent = nomes.length ? nomes.join(', ') : '—';
  $('#r-barbeiro').textContent = BARBEIROS.find((b) => b.id === estado.barbeiro).nome;
  $('#r-quando').textContent = estado.data && estado.hora
    ? `${deChave(estado.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às ${estado.hora}`
    : '—';
  $('#r-duracao').textContent = estado.servicos.length ? formatarDuracao(duracaoTotal()) : '—';
  $('#r-total').textContent = brl(precoTotal());
}

const atualizar = () => { renderHorarios(); renderResumo(); };

// ---------- Eventos do formulário ----------
$('#lista-servicos').addEventListener('change', () => {
  estado.servicos = [...document.querySelectorAll('input[name="servico"]:checked')].map((i) => i.value);
  atualizar();
});
$('#lista-barbeiros').addEventListener('change', (e) => { estado.barbeiro = e.target.value; atualizar(); });
$('#dias').addEventListener('click', (e) => {
  const b = e.target.closest('.dia');
  if (!b || b.disabled) return;
  estado.data = b.dataset.dia;
  document.querySelectorAll('.dia').forEach((x) => x.classList.toggle('ativo', x === b));
  atualizar();
});
$('#horarios').addEventListener('click', (e) => {
  const b = e.target.closest('.horario');
  if (!b || b.disabled) return;
  estado.hora = b.dataset.hora;
  document.querySelectorAll('.horario').forEach((x) => x.classList.toggle('ativo', x === b));
  renderResumo();
});

// Máscara de telefone: (51) 99999-9999
$('#telefone').addEventListener('input', (e) => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
  e.target.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
    : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
});

function gerarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
}

$('#form-agenda').addEventListener('submit', (e) => {
  e.preventDefault();
  const erro = $('#erro');
  const nome = $('#nome').value.trim();
  const tel = $('#telefone').value.replace(/\D/g, '');
  $('#nome').classList.toggle('invalido', !nome);
  $('#telefone').classList.toggle('invalido', tel.length < 10);

  if (!estado.servicos.length) return (erro.textContent = 'Escolha pelo menos um serviço.');
  if (!estado.data || !estado.hora) return (erro.textContent = 'Escolha o dia e o horário.');
  if (!nome) return (erro.textContent = 'Informe seu nome.');
  if (tel.length < 10) return (erro.textContent = 'Informe um WhatsApp válido com DDD.');
  erro.textContent = '';

  const qtd = duracaoTotal() / INTERVALO;
  const inicio = SLOTS.indexOf(estado.hora);
  const barbeiro = estado.barbeiro === 'qualquer'
    ? primeiroBarbeiroLivre(estado.data, inicio, qtd)?.id
    : (barbeiroLivre(estado.barbeiro, estado.data, inicio, qtd) ? estado.barbeiro : null);
  if (!barbeiro) { erro.textContent = 'Esse horário acabou de ser ocupado. Escolha outro.'; renderHorarios(); return; }

  const novo = {
    id: Date.now(),
    codigo: gerarCodigo(),
    servicos: [...estado.servicos],
    barbeiro,
    data: estado.data,
    hora: estado.hora,
    duracao: duracaoTotal(),
    total: precoTotal(),
    nome,
    telefone: $('#telefone').value,
    obs: $('#obs').value.trim()
  };
  agendamentos.push(novo);
  armazenamento.salvar(agendamentos);
  abrirConfirmacao(novo);

  // Limpa para um próximo agendamento
  e.target.reset();
  estado.servicos = []; estado.hora = null; estado.barbeiro = 'qualquer';
  renderBarbeiros(); atualizar(); renderMeus(); renderPainel();
});

// ---------- Modal de confirmação ----------
function textoAgendamento(a) {
  const servicos = a.servicos.map((id) => SERVICOS.find((s) => s.id === id).nome).join(' + ');
  const barbeiro = BARBEIROS.find((b) => b.id === a.barbeiro).nome;
  const dia = deChave(a.data).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return { servicos, barbeiro, dia };
}

function abrirConfirmacao(a) {
  const { servicos, barbeiro, dia } = textoAgendamento(a);
  $('#modal-texto').textContent = `${servicos} com ${barbeiro}, ${dia} às ${a.hora}.`;
  $('#modal-codigo').textContent = a.codigo;
  const msg = `Olá! Acabei de agendar na Navalha:\n${servicos} com ${barbeiro}\n${dia} às ${a.hora}\nNome: ${a.nome}\nCódigo: ${a.codigo}`;
  $('#modal-whats').href = `https://wa.me/${WHATSAPP_BARBEARIA}?text=${encodeURIComponent(msg)}`;
  $('#modal').showModal();
}
$('#modal-fechar').addEventListener('click', () => $('#modal').close());

// ---------- Meus horários ----------
function renderMeus() {
  const agora = new Date();
  const lista = [...agendamentos].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const futuros = lista.filter((a) => new Date(`${a.data}T${a.hora}`) >= agora);
  $('#contador').textContent = futuros.length;

  if (!lista.length) {
    $('#lista-meus').innerHTML = '<div class="estado-vazio"><p>Você ainda não tem horários marcados.</p><button class="btn btn--secundario btn--pequeno" data-ir="agendar">Agendar agora</button></div>';
    return;
  }
  $('#lista-meus').innerHTML = lista.map((a) => {
    const { servicos, barbeiro, dia } = textoAgendamento(a);
    const passado = new Date(`${a.data}T${a.hora}`) < agora;
    return `<article class="cartao ${passado ? 'passado' : ''}">
      <h3>${escapar(dia)} · ${a.hora}</h3>
      <p><b>${escapar(servicos)}</b> com ${escapar(barbeiro)}</p>
      <p>${brl(a.total)} · ${formatarDuracao(a.duracao)} · código ${a.codigo}</p>
      ${a.obs ? `<p>Obs.: ${escapar(a.obs)}</p>` : ''}
      ${passado ? '<p>Atendimento concluído</p>' : `<div class="acoes"><button class="btn btn--secundario btn--pequeno" data-cancelar="${a.id}">Cancelar horário</button></div>`}
    </article>`;
  }).join('');
}

// Cancelamento com confirmação em dois toques (sem alert/confirm)
$('#lista-meus').addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir) return trocarAba(ir.dataset.ir);
  const b = e.target.closest('[data-cancelar]');
  if (!b) return;
  if (!b.dataset.confirmar) {
    b.dataset.confirmar = '1';
    b.textContent = 'Toque de novo para cancelar';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = 'Cancelar horário'; } }, 3000);
    return;
  }
  agendamentos = agendamentos.filter((a) => a.id !== Number(b.dataset.cancelar));
  armazenamento.salvar(agendamentos);
  renderMeus(); renderHorarios(); renderPainel();
});

// ---------- Painel do barbeiro ----------
function renderPainel() {
  const data = $('#data-painel').value || chaveData(new Date());
  const fechado = DIAS_FECHADOS.includes(deChave(data).getDay());
  let totalAtend = 0, faturamento = 0, ocupados = 0;

  const colunas = BARBEIROS.slice(1).map((b) => {
    const itens = [];
    if (!fechado) {
      SLOTS.forEach((slot) => {
        if (ocupadoPorTelefone(b.id, data, slot)) { itens.push({ hora: slot, telefone: true }); ocupados++; }
      });
      agendamentos.filter((a) => a.barbeiro === b.id && a.data === data).forEach((a) => {
        itens.push({ hora: a.hora, ag: a });
        totalAtend++; faturamento += a.total; ocupados += a.duracao / INTERVALO;
      });
    }
    itens.sort((x, y) => x.hora.localeCompare(y.hora));
    const lis = itens.map((i) => i.telefone
      ? `<li class="telefone"><time>${i.hora}</time><span>Cliente por telefone</span></li>`
      : `<li><time>${i.hora}</time><span><b>${escapar(i.ag.nome)}</b><small>${escapar(textoAgendamento(i.ag).servicos)} · ${escapar(i.ag.telefone)}</small></span></li>`).join('');
    return `<div class="coluna"><header><span class="avatar" style="background:${b.cor}">${b.nome[0]}</span><b>${b.nome}</b></header>
      ${fechado ? '<p class="livre">Fechado</p>' : lis ? `<ul>${lis}</ul>` : '<p class="livre">Agenda livre</p>'}</div>`;
  }).join('');

  const capacidade = fechado ? 0 : SLOTS.length * (BARBEIROS.length - 1);
  $('#estatisticas').innerHTML = `
    <div class="estatistica"><span>Agendados pelo site</span><strong>${totalAtend}</strong></div>
    <div class="estatistica"><span>Faturamento previsto (site)</span><strong>${brl(faturamento)}</strong></div>
    <div class="estatistica"><span>Ocupação da agenda</span><strong>${capacidade ? Math.round((ocupados / capacidade) * 100) : 0}%</strong></div>`;
  $('#agenda-colunas').innerHTML = colunas;
}
$('#data-painel').addEventListener('change', renderPainel);

// ---------- Abas ----------
function trocarAba(id) {
  document.querySelectorAll('.aba').forEach((a) => {
    const ativa = a.dataset.aba === id;
    a.classList.toggle('ativa', ativa);
    a.setAttribute('aria-selected', ativa);
  });
  document.querySelectorAll('.painel').forEach((p) => { p.hidden = p.id !== id; });
  if (id === 'meus') renderMeus();
  if (id === 'painel') renderPainel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelector('.abas').addEventListener('click', (e) => {
  const a = e.target.closest('.aba');
  if (a) trocarAba(a.dataset.aba);
});

// ---------- Início ----------
$('#data-painel').value = chaveData(new Date());
renderServicos();
renderBarbeiros();
renderDias();
atualizar();
renderMeus();
