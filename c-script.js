// ==========================================
// CEOCARD v3.8.1 - PARTE 1 (Core, Tema, Dashboard e Correção de Atendimento)
// ==========================================

// --- ESTADO INICIAL E PERSISTÊNCIA ---
let clientes = JSON.parse(localStorage.getItem('ceocard_clientes')) || [];
let agendamentos = JSON.parse(localStorage.getItem('ceocard_agenda')) || [];
let ramos = JSON.parse(localStorage.getItem('ceocard_ramos')) || [{ id: 1, nome: 'Geral' }];
let historico = JSON.parse(localStorage.getItem('ceocard_historico')) || [];
let atendimentoAtivo = null; // Será preenchido na inicialização se houver algo pendente
let timerInterval = null;

// Filtros da Agenda
let filtroAgendaTipo = 'todas';
let dataFiltroAtual = getLocalISODate(new Date());

// Os 8 Status Fixos
const STATUS_FIXOS = [
    { id: 'sem_registro', nome: 'Sem Registro', classe: 'bg-sem-registro' },
    { id: 'livre', nome: 'Livre', classe: 'bg-livre' },
    { id: 'visita_agendada', nome: 'Visita Agendada', classe: 'bg-visita-agendada' },
    { id: 'reuniao_agendada', nome: 'Reunião Agendada', classe: 'bg-reuniao-agendada' },
    { id: 'em_atendimento', nome: 'Em Atendimento', classe: 'bg-em-atendimento' },
    { id: 'visitado', nome: 'Cliente Visitado', classe: 'bg-visitado' },
    { id: 'assistido', nome: 'Cliente Assistido', classe: 'bg-assistido' },
    { id: 'inativo', nome: 'Cliente Inativo', classe: 'bg-inativo' }
];

// --- INICIALIZAÇÃO CRÍTICA (CORREÇÃO DE ATENDIMENTO) ---
function verificarAtendimentoPendente() {
    // Procura na base de dados por um agendamento que foi iniciado mas não finalizado
    const pendente = agendamentos.find(a => a.inicio && !a.finalizado);
    if (pendente) {
        atendimentoAtivo = pendente;
        atendimentoAtivo.inicio = new Date(pendente.inicio); // Reconverte para objeto Date
        // Reinicia o timer visual se estivermos na aba de atendimento (ou prepara para quando abrir)
        retomarTimer();
    }
}

function retomarTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!atendimentoAtivo || !atendimentoAtivo.inicio) return;
        const diff = Math.floor((new Date() - atendimentoAtivo.inicio) / 1000);
        const h = Math.floor(diff/3600).toString().padStart(2,'0');
        const m = Math.floor((diff%3600)/60).toString().padStart(2,'0');
        const s = (diff%60).toString().padStart(2,'0');
        const display = document.getElementById('atendTimer');
        if (display) display.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// --- AUXILIARES DE DATA ---
function getLocalISODate(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

function getNomeDiaCurto(date) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[date.getDay()];
}

// --- TEMA (DARK MODE) ---
function initTheme() {
    const isDark = localStorage.getItem('ceocard_theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = isDark;
}

function toggleDarkMode() {
    const isDark = document.getElementById('darkModeToggle').checked;
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('ceocard_theme', isDark ? 'dark' : 'light');
}

// --- MOTOR INTELIGENTE DE STATUS ---
function calcularStatusCliente(cliente) {
    if (cliente.inativo) return STATUS_FIXOS.find(s => s.id === 'inativo');

    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    // Verificação real na base de dados
    const emAtendimento = agendamentos.some(a => a.clienteId == cliente.id && a.inicio && !a.finalizado);
    if (emAtendimento) return STATUS_FIXOS.find(s => s.id === 'em_atendimento');

    const agendaMes = agendamentos.filter(a => a.clienteId == cliente.id && !a.finalizado && 
        new Date(a.data).getMonth() === mesAtual && new Date(a.data).getFullYear() === anoAtual);
    
    if (agendaMes.length > 0) {
        const temVisita = agendaMes.some(a => a.tipo.includes('Visita') || a.tipo.includes('Urgência'));
        return STATUS_FIXOS.find(s => s.id === (temVisita ? 'visita_agendada' : 'reuniao_agendada'));
    }

    const histMes = historico.filter(h => h.clienteId == cliente.id && 
        new Date(h.dataFim).getMonth() === mesAtual && new Date(h.dataFim).getFullYear() === anoAtual);
    
    if (histMes.length > 0) {
        const teveVisita = histMes.some(h => h.tipo.includes('Visita') || h.tipo.includes('Urgência'));
        return STATUS_FIXOS.find(s => s.id === (teveVisita ? 'visitado' : 'assistido'));
    }

    const histTotal = historico.filter(h => h.clienteId == cliente.id);
    if (histTotal.length === 0) return STATUS_FIXOS.find(s => s.id === 'sem_registro');

    return STATUS_FIXOS.find(s => s.id === 'livre');
}

// --- NAVEGAÇÃO ---
function switchView(view) {
    const views = ['timeline-view', 'dashboard-view', 'clientes-view', 'config-view'];
    const titleMap = { 'timeline': 'Agenda do Dia', 'dashboard': 'Visão Geral', 'clientes': 'Gestão de Clientes', 'config': 'Ajustes' };

    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) subtitle.innerText = titleMap[view] || "";

    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === view + '-view') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById("btn-nav-" + view);
    if (activeBtn) activeBtn.classList.add('active');

    if (view === 'timeline') { gerarDateStrip(); renderTimeline(); }
    if (view === 'dashboard') { renderDashboard(); renderBoard(); }
    if (view === 'clientes') { popularFiltrosClientes(); filtrarClientes(); }
    if (view === 'config') { renderListasConfig(); }
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const isVisible = modal.style.display === "flex";
    modal.style.display = isVisible ? "none" : "flex";

    if (!isVisible) {
        if (modalId === 'modalCliente') popularSelectRamos();
        if (modalId === 'modalAgendamento') {
            popularSelectClientes();
            const alerta = document.getElementById('alertaConflito');
            if (alerta) alerta.style.display = 'none';
        }
    }
}

// --- DASHBOARD E QUADRO ---
function renderDashboard() {
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    
    const visitasMes = historico.filter(h => new Date(h.dataFim).getMonth() === mesAtual && new Date(h.dataFim).getFullYear() === anoAtual);
    const totalSegundos = visitasMes.reduce((acc, curr) => acc + (curr.duracaoSegundos || 0), 0);
    const inativos = clientes.filter(c => c.inativo).length;

    if(document.getElementById('stat-visitas')) document.getElementById('stat-visitas').innerText = visitasMes.length;
    if(document.getElementById('stat-horas')) document.getElementById('stat-horas').innerText = Math.floor(totalSegundos / 3600) + "h";
    if(document.getElementById('stat-resolvidos')) document.getElementById('stat-resolvidos').innerText = visitasMes.length;
    if(document.getElementById('stat-pendentes')) document.getElementById('stat-pendentes').innerText = inativos;

    const fill = document.getElementById('eficiencia-fill');
    if (fill) fill.style.width = Math.min((visitasMes.length / 20) * 100, 100) + "%";
}

function renderBoard() {
    const container = document.getElementById('board-container-inner');
    if (!container) return;
    container.innerHTML = '';

    STATUS_FIXOS.forEach(status => {
        const clientesNesteStatus = clientes.filter(c => calcularStatusCliente(c).id === status.id);
        if (clientesNesteStatus.length === 0) return;

        const col = document.createElement('div');
        col.className = 'column';
        col.innerHTML = `<h3>${status.nome} <small>(${clientesNesteStatus.length})</small></h3>`;
        
        clientesNesteStatus.forEach(cli => {
            const statusObj = calcularStatusCliente(cli);
            col.innerHTML += `
                <div class="card">
                    <span class="status-chip ${statusObj.classe}">${statusObj.nome}</span>
                    <strong style="display:block; margin-top:5px; color:var(--primary);">${cli.fantasia}</strong>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">
                        <i class="fa-solid fa-briefcase"></i> ${cli.ramo || 'Geral'}
                    </div>
                </div>`;
        });
        container.appendChild(col);
    });
}
// ==========================================
// CEOCARD v3.8.1 - PARTE 2 (Calendário, Briefing, Atendimento e Clientes)
// ==========================================

// --- CALENDÁRIO INTERATIVO (DATE STRIP) ---
function gerarDateStrip() {
    const container = document.getElementById('dateStripContainer');
    if (!container) return;
    container.innerHTML = '';

    const hoje = new Date();
    // Gera 15 dias para trás e 30 dias para a frente
    for (let i = -15; i <= 30; i++) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() + i);
        
        const dataISOCurto = getLocalISODate(d);
        const diaSemana = getNomeDiaCurto(d);
        const diaMes = d.getDate().toString().padStart(2, '0');
        
        const isSelected = dataISOCurto === dataFiltroAtual;
        
        const btn = document.createElement('div');
        btn.className = `date-item ${isSelected ? 'active' : ''}`;
        btn.id = `date-btn-${dataISOCurto}`;
        btn.onclick = () => selecionarDataFiltro(dataISOCurto);
        
        btn.innerHTML = `<span class="day">${diaSemana}</span><span class="date">${diaMes}</span>`;
        container.appendChild(btn);
    }
    
    setTimeout(() => {
        const btnAtivo = document.getElementById(`date-btn-${dataFiltroAtual}`);
        if (btnAtivo) {
            btnAtivo.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 100);
}

function selecionarDataFiltro(dataStr) {
    dataFiltroAtual = dataStr;
    gerarDateStrip();
    renderTimeline();
}

// --- BRIEFING DIÁRIO (NOTIFICAÇÕES) ---
function atualizarBriefingDiario(agendaDoDia) {
    const card = document.getElementById('dailyBriefing');
    const title = document.getElementById('briefingTitle');
    const text = document.getElementById('briefingText');
    if (!card || !title || !text) return;

    const total = agendaDoDia.length;
    const pendentes = agendaDoDia.filter(a => !a.finalizado).length;
    const urgencias = agendaDoDia.filter(a => a.tipo.includes('Urgência') && !a.finalizado).length;

    card.style.display = 'flex';
    if (total === 0) {
        card.style.background = 'linear-gradient(135deg, #1abc9c, #16a085)';
        card.querySelector('.briefing-icon').innerHTML = '<i class="fa-solid fa-mug-hot"></i>';
        text.innerText = "Dia livre! Aproveite para organizar a sua base de clientes.";
    } else if (pendentes === 0) {
        card.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
        card.querySelector('.briefing-icon').innerHTML = '<i class="fa-solid fa-trophy"></i>';
        text.innerText = `Excelente! Todos os ${total} compromissos foram concluídos.`;
    } else {
        card.style.background = urgencias > 0 ? 'linear-gradient(135deg, #e74c3c, #c0392b)' : 'linear-gradient(135deg, var(--brand-orange), #ff8a00)';
        card.querySelector('.briefing-icon').innerHTML = urgencias > 0 ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-bell"></i>';
        text.innerText = `Tens ${pendentes} pendência(s)${urgencias > 0 ? ` (${urgencias} urgentes)` : ''} para este dia.`;
    }
}

// --- AGENDA INTERATIVA ---
function filtrarAgenda(tipo) {
    filtroAgendaTipo = tipo;
    document.querySelectorAll('.chip-filter').forEach(btn => btn.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');
    renderTimeline();
}

function renderTimeline() {
    const container = document.getElementById('timelineList');
    if (!container) return;
    container.innerHTML = '';

    let agendaDoDia = agendamentos.filter(a => a.data === dataFiltroAtual);
    atualizarBriefingDiario(agendaDoDia);

    let agendaFiltrada = agendaDoDia;
    if (filtroAgendaTipo === 'urgencias') agendaFiltrada = agendaDoDia.filter(a => a.tipo.includes('Urgência'));
    else if (filtroAgendaTipo === 'concluidas') agendaFiltrada = agendaDoDia.filter(a => a.finalizado);

    const agenda = agendaFiltrada.sort((a, b) => new Date((a.data||'')+'T'+(a.hora||'00:00')) - new Date((b.data||'')+'T'+(b.hora||'00:00')));

    if (agenda.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);">Sem registos para este filtro.</p>`;
        return;
    }

    agenda.forEach(age => {
        const cli = clientes.find(c => c.id == age.clienteId);
        const item = document.createElement('div');
        item.className = 'timeline-item' + (age.finalizado ? ' finalizado' : '');
        
        const duracao = age.tipo.includes('Reunião') ? '30 min' : '1h30m';
        const cor = age.tipo.includes('Urgência') ? 'var(--danger)' : (age.tipo.includes('Reunião') ? '#8e44ad' : 'var(--info)');

        item.innerHTML = `
            <div class="timeline-header" onclick="this.parentElement.classList.toggle('active')">
                <div>
                    <strong style="color:var(--primary);">${cli ? cli.fantasia : 'Externo'}</strong>
                    <div style="margin-top:5px;"><span style="background:${cor}; color:white; font-size:0.6rem; padding:2px 6px; border-radius:4px;">${age.tipo}</span></div>
                </div>
                <div style="text-align:right;">
                    <strong style="font-size:1.1rem;">${age.hora}</strong>
                    <i class="fa-solid ${age.finalizado ? 'fa-circle-check' : 'fa-chevron-down'}" style="margin-left:8px; color:${age.finalizado ? 'var(--success)' : 'var(--text-muted)'}"></i>
                </div>
            </div>
            <div class="timeline-body">
                <p style="font-size:0.8rem; color:var(--text-main); margin-bottom:10px;">
                    <i class="fa-solid fa-location-dot"></i> ${cli ? cli.rua : 'N/A'}<br>
                    <i class="fa-solid fa-user"></i> ${cli ? cli.contato : 'N/A'}
                </p>
                <button class="btn-save" style="width:100%; background:${age.finalizado ? 'var(--success)' : 'var(--brand-orange)'}" onclick="abrirAtendimento(${age.id})">
                    ${age.finalizado ? 'Ver Relatório' : 'Iniciar Atendimento'}
                </button>
            </div>`;
        container.appendChild(item);
    });
}

// --- ATENDIMENTO (CHECK-IN / OUT PERSISTENTE) ---
function abrirAtendimento(id) {
    const age = agendamentos.find(a => a.id == id);
    if (!age) return;
    atendimentoAtivo = age;
    const cli = clientes.find(c => c.id == age.clienteId);

    document.getElementById('atendClienteNome').innerText = cli ? cli.fantasia : 'Atendimento';
    document.getElementById('atendRelatorio').value = age.relatorio || '';
    
    const isFin = age.finalizado === true;
    document.getElementById('areaBotoesAtendimento').style.display = isFin ? 'none' : 'flex';
    document.getElementById('btnCheckIn').disabled = !!age.inicio;
    document.getElementById('btnCheckOut').disabled = !age.inicio;

    if (age.inicio && !age.finalizado) {
        atendimentoAtivo.inicio = new Date(age.inicio);
        retomarTimer();
    } else {
        document.getElementById('atendTimer').innerText = age.duracaoFormatada || "00:00:00";
    }

    toggleModal('modalAtendimento');
}

function realizarCheckIn() {
    const agora = new Date();
    atendimentoAtivo.inicio = agora;
    
    // Grava o início na base de dados imediatamente para persistência
    const idx = agendamentos.findIndex(a => a.id === atendimentoAtivo.id);
    agendamentos[idx].inicio = agora.toISOString();
    localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));

    document.getElementById('btnCheckIn').disabled = true;
    document.getElementById('btnCheckOut').disabled = false;
    retomarTimer();
}

function realizarCheckOut() {
    clearInterval(timerInterval);
    const fim = new Date();
    const duracaoSeg = Math.floor((fim - atendimentoAtivo.inicio) / 1000);
    
    const index = agendamentos.findIndex(a => a.id === atendimentoAtivo.id);
    agendamentos[index].finalizado = true;
    agendamentos[index].duracaoSegundos = duracaoSeg;
    agendamentos[index].duracaoFormatada = document.getElementById('atendTimer').innerText;
    agendamentos[index].relatorio = document.getElementById('atendRelatorio').value;
    agendamentos[index].dataFim = fim.toISOString();
    
    historico.push({...agendamentos[index]});
    
    const pD = document.getElementById('proxAgeData').value;
    const pH = document.getElementById('proxAgeHora').value;
    if (pD && pH) {
        agendamentos.push({ id: Date.now()+1, clienteId: atendimentoAtivo.clienteId, data: pD, hora: pH, tipo: document.getElementById('proxAgeTipo').value, finalizado: false });
    }

    localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
    localStorage.setItem('ceocard_historico', JSON.stringify(historico));
    
    atendimentoAtivo = null;
    toggleModal('modalAtendimento');
    switchView('dashboard');
}

// --- CLIENTES E AJUSTES ---
function popularSelectClientes() {
    const sel = document.getElementById('ageCliente');
    if (sel) sel.innerHTML = '<option value="">Selecionar Cliente...</option>' + clientes.filter(c => !c.inativo).map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
}

function popularSelectRamos() {
    const sel = document.getElementById('cliRamo');
    if (sel) sel.innerHTML = '<option value="">Selecionar Ramo...</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');
}

function renderListasConfig() {
    const cont = document.getElementById('listaRamosConfig');
    if (cont) cont.innerHTML = ramos.map(r => `<div style="display:flex; justify-content:space-between; padding:10px; background:var(--bg-secondary); border-radius:8px; margin-bottom:5px;">${r.nome} <i class="fa-solid fa-trash" onclick="deletarRamo(${r.id})" style="color:var(--danger)"></i></div>`).join('');
}

function deletarRamo(id) {
    if(confirm("Excluir ramo?")) { ramos = ramos.filter(r => r.id !== id); localStorage.setItem('ceocard_ramos', JSON.stringify(ramos)); renderListasConfig(); }
}

function exportarDados() {
    const data = { clientes, agendamentos, ramos, historico };
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ceocard_backup.json'; a.click();
}

function importarDados(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = JSON.parse(event.target.result);
        localStorage.setItem('ceocard_clientes', JSON.stringify(data.clientes));
        localStorage.setItem('ceocard_agenda', JSON.stringify(data.agendamentos));
        localStorage.setItem('ceocard_ramos', JSON.stringify(data.ramos));
        localStorage.setItem('ceocard_historico', JSON.stringify(data.historico));
        location.reload();
    };
    reader.readAsText(e.target.files[0]);
}

window.onload = () => {
    initTheme();
    verificarAtendimentoPendente();
    switchView('timeline');
};
