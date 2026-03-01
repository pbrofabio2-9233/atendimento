// ==========================================
// CEOCARD - VERSÃO DEFINITIVA UNIFICADA
// ==========================================

// 1. VARIÁVEIS GLOBAIS (Declaradas apenas UMA vez!)
let clientes = JSON.parse(localStorage.getItem('ceocard_clientes')) || [];
let agendamentos = JSON.parse(localStorage.getItem('ceocard_agenda')) || [];
let ramos = JSON.parse(localStorage.getItem('ceocard_ramos')) || [{ id: 1, nome: 'Geral' }];
let historico = JSON.parse(localStorage.getItem('ceocard_historico')) || [];
let atendimentoAtivo = null;
let timerInterval = null;

let filtroAgendaTipo = 'todas';
let dataFiltroAtual = getLocalISODate(new Date());

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

// 2. UTILITÁRIOS
function saveData() {
    localStorage.setItem('ceocard_clientes', JSON.stringify(clientes));
    localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
    localStorage.setItem('ceocard_ramos', JSON.stringify(ramos));
    localStorage.setItem('ceocard_historico', JSON.stringify(historico));
}

function getLocalISODate(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

function getNomeDiaCurto(date) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[date.getDay()];
}

// 3. TEMA E NAVEGAÇÃO
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

function switchView(view) {
    const views = ['timeline-view', 'dashboard-view', 'clientes-view', 'config-view'];
    const titles = { 'timeline': 'Agenda', 'dashboard': 'Visão Geral', 'clientes': 'Clientes', 'config': 'Ajustes' };
    
    const sub = document.getElementById('page-subtitle');
    if (sub) sub.innerText = titles[view] || "";

    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === view + '-view') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const btnNav = document.getElementById("btn-nav-" + view);
    if (btnNav) btnNav.classList.add('active');

    if (view === 'timeline') { gerarDateStrip(); renderTimeline(); }
    if (view === 'dashboard') { renderDashboard(); renderBoard(); }
    if (view === 'clientes') { popularFiltrosClientes(); filtrarClientes(); }
    if (view === 'config') { renderListasConfig(); }
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const isVis = modal.style.display === "flex";
    modal.style.display = isVis ? "none" : "flex";

    // Gatilhos de Abertura Seguros
    if (!isVis) {
        // Popula os clientes na agenda, mas DEIXA OS RAMOS EM PAZ
        // (Os ramos já são preenchidos corretamente pelas funções de Novo/Editar)
        if (modalId === 'modalAgendamento') popularSelectClientes();
    }
}

// 4. MOTOR INTELIGENTE (STATUS E DASHBOARD)
function calcularStatusCliente(cliente) {
    if (!cliente) return STATUS_FIXOS[0];
    if (cliente.inativo) return STATUS_FIXOS.find(s => s.id === 'inativo');
    
    const hoje = new Date();
    const mes = hoje.getMonth();
    const ano = hoje.getFullYear();

    const emAtend = agendamentos.some(a => a.clienteId == cliente.id && a.inicio && !a.finalizado);
    if (emAtend) return STATUS_FIXOS.find(s => s.id === 'em_atendimento');

    const agMes = agendamentos.filter(a => a.clienteId == cliente.id && !a.finalizado && a.data);
    const temAg = agMes.some(a => {
        const d = new Date(a.data + 'T00:00:00');
        return d.getMonth() === mes && d.getFullYear() === ano;
    });
    if (temAg) {
        const visita = agMes.some(a => a.tipo.includes('Visita') || a.tipo.includes('Urgência'));
        return STATUS_FIXOS.find(s => s.id === (visita ? 'visita_agendada' : 'reuniao_agendada'));
    }

    const hiMes = historico.filter(h => h.clienteId == cliente.id && h.dataFim);
    const temHi = hiMes.some(h => {
        const d = new Date(h.dataFim);
        return d.getMonth() === mes && d.getFullYear() === ano;
    });
    if (temHi) {
        const visita = hiMes.some(h => h.tipo.includes('Visita') || h.tipo.includes('Urgência'));
        return STATUS_FIXOS.find(s => s.id === (visita ? 'visitado' : 'assistido'));
    }

    return historico.filter(h => h.clienteId == cliente.id).length === 0 ? STATUS_FIXOS[0] : STATUS_FIXOS[1];
}

function renderDashboard() {
    const hoje = new Date();
    const visitasMes = historico.filter(h => {
        if (!h.dataFim) return false;
        const d = new Date(h.dataFim);
        return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    });

    const segundos = visitasMes.reduce((acc, c) => acc + (c.duracaoSegundos || 0), 0);
    const inativos = clientes.filter(c => c.inativo).length;

    const ids = { 'stat-visitas': visitasMes.length, 'stat-horas': Math.floor(segundos/3600)+'h', 'stat-resolvidos': visitasMes.length, 'stat-pendentes': inativos };
    for (let id in ids) {
        const el = document.getElementById(id);
        if (el) el.innerText = ids[id];
    }

    const fill = document.getElementById('eficiencia-fill');
    if (fill) fill.style.width = Math.min((visitasMes.length / 20) * 100, 100) + "%";
}

function renderBoard() {
    const container = document.getElementById('board-container-inner');
    if (!container) return;
    container.innerHTML = '';

    STATUS_FIXOS.forEach(st => {
        const lista = clientes.filter(c => calcularStatusCliente(c).id === st.id);
        if (lista.length === 0) return;
        
        const col = document.createElement('div');
        col.className = 'column';
        col.innerHTML = `<h3>${st.nome} <small>(${lista.length})</small></h3>`;
        lista.forEach(c => {
            col.innerHTML += `<div class="card" style="opacity: ${c.inativo ? '0.6' : '1'}">
                <span class="status-chip ${st.classe}">${st.nome}</span>
                <strong style="display:block; margin-top:5px; color:var(--primary);">${c.fantasia}</strong>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">
                    <i class="fa-solid fa-briefcase"></i> ${c.ramo || 'Geral'}
                </div>
            </div>`;
        });
        container.appendChild(col);
    });
}

// 5. GESTÃO DE CLIENTES E RAMOS (CORRIGIDO)
function popularSelectRamos() {
    const sel = document.getElementById('cliRamo');
    const fil = document.getElementById('filterRamo');
    const options = '<option value="">Selecionar Ramo...</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');
    if (sel) sel.innerHTML = options;
    if (fil) fil.innerHTML = '<option value="">Todos os Ramos</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');
}

function popularSelectClientes() {
    const sel = document.getElementById('ageCliente');
    if (!sel) return;
    const ativos = clientes.filter(c => !c.inativo);
    sel.innerHTML = ativos.length === 0 ? '<option value="">Nenhum cliente ativo</option>' :
        '<option value="">Selecionar Cliente...</option>' + ativos.map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
}

function popularFiltrosClientes() {
    popularSelectRamos();
    const sStatus = document.getElementById('filterStatus');
    if (sStatus) sStatus.innerHTML = '<option value="">Todos os Status</option>' + STATUS_FIXOS.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
}

function filtrarClientes() {
    const termo = (document.getElementById('searchClient')?.value || "").toLowerCase();
    const fRamo = document.getElementById('filterRamo')?.value || "";
    const fStatus = document.getElementById('filterStatus')?.value || "";
    const container = document.getElementById('clientsList');
    if (!container) return;

    const filtrados = clientes.filter(c => {
        const matchNome = (c.fantasia || "").toLowerCase().includes(termo);
        const matchRamo = fRamo === "" || c.ramo === fRamo;
        const matchStatus = fStatus === "" || calcularStatusCliente(c).id === fStatus;
        return matchNome && matchRamo && matchStatus;
    });

    container.innerHTML = filtrados.length === 0 ? '<p style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum cliente encontrado.</p>' :
    filtrados.map(c => {
        const st = calcularStatusCliente(c);
        return `
        <div class="card" style="margin-bottom:12px; border-left:5px solid ${c.inativo ? '#e74c3c' : 'var(--brand-orange)'}; opacity: ${c.inativo ? '0.7' : '1'}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:1.1rem; color:var(--primary);">${c.fantasia}</strong>
                    <button onclick="abrirModalEditarCliente(${c.id})" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-left:8px;"><i class="fa-solid fa-pen"></i></button>
                    <div style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-briefcase"></i> ${c.ramo || 'Geral'}</div>
                    <div style="margin-top:5px;"><span class="status-chip ${st.classe}">${st.nome}</span></div>
                </div>
                <button class="btn-outline" onclick="verHistoricoCliente(${c.id})"><i class="fa-solid fa-list-ul"></i></button>
            </div>
        </div>`;
    }).join('');
}

function abrirModalNovoCliente() {
    const f = document.getElementById('formCliente');
    if (f) f.reset();
    document.getElementById('cliId').value = '';
    document.getElementById('modalClienteTitulo').innerText = 'Novo Cliente';
    popularSelectRamos();
    toggleModal('modalCliente');
}

function abrirModalEditarCliente(id) {
    const c = clientes.find(cli => cli.id == id);
    if (!c) return;
    
    // REDE DE SEGURANÇA: Popula ramos PRIMEIRO
    popularSelectRamos();
    
    // Se o ramo guardado não existir mais na lista global, recria-o temporariamente
    const selRamo = document.getElementById('cliRamo');
    if (c.ramo && !ramos.some(r => r.nome === c.ramo)) {
        const opt = document.createElement('option');
        opt.value = c.ramo;
        opt.text = `${c.ramo} (Removido)`;
        selRamo.appendChild(opt);
    }
    
    document.getElementById('cliId').value = c.id;
    document.getElementById('cliCodigo').value = c.codigo || '';
    document.getElementById('cliRazao').value = c.razao || '';
    document.getElementById('cliFantasia').value = c.fantasia || '';
    document.getElementById('cliInativo').checked = !!c.inativo;
    
    // AGORA SIM, DEFINE O VALOR:
    selRamo.value = c.ramo || ''; 
    
    document.getElementById('cliRua').value = c.rua || '';
    document.getElementById('cliNumero').value = c.numero || '';
    document.getElementById('cliBairro').value = c.bairro || '';
    document.getElementById('cliCidade').value = c.cidade || '';
    document.getElementById('cliEstado').value = c.estado || '';
    document.getElementById('cliContatoNome').value = c.contato || '';
    document.getElementById('cliTelefone').value = c.telefone || '';
    document.getElementById('cliObs').value = c.obs || '';

    document.getElementById('modalClienteTitulo').innerText = 'Editar Cliente';
    toggleModal('modalCliente');
}

function verHistoricoCliente(id) {
    const c = clientes.find(cli => cli.id == id);
    if (!c) return;
    const tit = document.getElementById('histClienteNome');
    if (tit) tit.innerText = `Histórico: ${c.fantasia}`;
    const cont = document.getElementById('histLista');
    if (!cont) return;

    const lista = historico.filter(h => h.clienteId == id).sort((a, b) => new Date(b.dataFim) - new Date(a.dataFim));
    
    if (lista.length === 0) {
        cont.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Sem registos.</p>';
    } else {
        cont.innerHTML = lista.map(h => {
            const dataF = new Date(h.dataFim).toLocaleString('pt-BR');
            return `
            <div style="background:var(--bg-secondary); padding:15px; border-radius:12px; margin-bottom:12px; border-left:4px solid var(--brand-orange);">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <strong style="color:var(--primary);"><i class="fa-solid fa-calendar-check" style="color:var(--brand-orange);"></i> ${dataF}</strong>
                    <span style="font-size:0.75rem; background:var(--brand-dark); color:white; padding:2px 8px; border-radius:10px;">${h.duracaoFormatada || '---'}</span>
                </div>
                <p style="font-size:0.85rem; margin:8px 0; color:var(--text-main);">${h.relatorio ? h.relatorio.replace(/\n/g, '<br>') : '<em>Sem relatório.</em>'}</p>
                ${h.observacaoPos ? `<div style="margin-top:10px; border-top:1px dashed var(--border-color); padding-top:8px; font-size:0.8rem; color:var(--info);"><strong>Nota:</strong> ${h.observacaoPos.replace(/\n/g, '<br>')}</div>` : ''}
            </div>`;
        }).join('');
    }
    toggleModal('modalHistorico');
}

// 6. AGENDA E ATENDIMENTO
function selecionarDataFiltro(dataStr) { dataFiltroAtual = dataStr; gerarDateStrip(); renderTimeline(); }

function gerarDateStrip() {
    const cont = document.getElementById('dateStripContainer');
    if (!cont) return;
    cont.innerHTML = '';
    const hoje = new Date();
    for (let i = -15; i <= 30; i++) {
        const d = new Date(hoje); d.setDate(hoje.getDate() + i);
        const iso = getLocalISODate(d);
        const item = document.createElement('div');
        item.className = `date-item ${iso === dataFiltroAtual ? 'active' : ''}`;
        item.id = `date-btn-${iso}`;
        item.onclick = () => selecionarDataFiltro(iso);
        item.innerHTML = `<span class="day">${getNomeDiaCurto(d)}</span><span class="date">${d.getDate().toString().padStart(2,'0')}</span>`;
        cont.appendChild(item);
    }
    setTimeout(() => document.getElementById(`date-btn-${dataFiltroAtual}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 100);
}

function filtrarAgenda(tipo) {
    filtroAgendaTipo = tipo;
    document.querySelectorAll('.chip-filter').forEach(b => b.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    renderTimeline();
}

function renderTimeline() {
    const cont = document.getElementById('timelineList');
    const cardBriefing = document.getElementById('dailyBriefing');
    if (!cont) return;
    
    const dia = agendamentos.filter(a => a.data === dataFiltroAtual);
    if(cardBriefing) {
        cardBriefing.style.display = 'flex';
        const pendentes = dia.filter(a => !a.finalizado).length;
        document.getElementById('briefingText').innerText = dia.length === 0 ? "Dia Livre!" : `Tens ${pendentes} pendência(s).`;
    }

    let fil = dia;
    if (filtroAgendaTipo === 'urgencias') fil = dia.filter(a => a.tipo.includes('Urgência'));
    else if (filtroAgendaTipo === 'concluidas') fil = dia.filter(a => a.finalizado);

    cont.innerHTML = fil.length === 0 ? '<p style="text-align:center; padding:20px; color:var(--text-muted);">Sem registos.</p>' :
        fil.sort((a,b) => a.hora.localeCompare(b.hora)).map(age => {
            const cli = clientes.find(c => c.id == age.clienteId);
            const cor = age.tipo.includes('Urgência') ? 'var(--danger)' : (age.tipo.includes('Reunião') ? '#8e44ad' : 'var(--info)');
            return `
            <div class="timeline-item ${age.finalizado ? 'finalizado' : ''}">
                <div class="timeline-header" onclick="this.parentElement.classList.toggle('active')">
                    <div><strong>${cli ? cli.fantasia : 'Externo'}</strong><div style="margin-top:5px;"><span style="background:${cor}; color:white; font-size:0.6rem; padding:2px 6px; border-radius:4px;">${age.tipo}</span></div></div>
                    <div style="text-align:right;"><strong>${age.hora}</strong></div>
                </div>
                <div class="timeline-body"><button class="btn-save" style="width:100%;" onclick="abrirAtendimento(${age.id})">${age.finalizado ? 'Ver' : 'Iniciar'}</button></div>
            </div>`;
        }).join('');
}

function abrirAtendimento(id) {
    const age = agendamentos.find(a => a.id == id);
    if (!age) return;
    atendimentoAtivo = age;
    document.getElementById('atendClienteNome').innerText = clientes.find(c => c.id == age.clienteId)?.fantasia || 'Atendimento';
    document.getElementById('atendRelatorio').value = age.relatorio || '';
    
    const isFin = age.finalizado === true;
    document.getElementById('areaBotoesAtendimento').style.display = isFin ? 'none' : 'flex';
    document.getElementById('areaObservacaoPos').style.display = isFin ? 'block' : 'none';
    if(isFin) document.getElementById('atendObsPos').value = age.observacaoPos || '';
    
    document.getElementById('btnCheckIn').disabled = !!age.inicio;
    document.getElementById('btnCheckOut').disabled = !age.inicio;

    if (age.inicio && !age.finalizado) retomarTimer();
    else document.getElementById('atendTimer').innerText = age.duracaoFormatada || "00:00:00";
    toggleModal('modalAtendimento');
}

function realizarCheckIn() {
    atendimentoAtivo.inicio = new Date().toISOString();
    const idx = agendamentos.findIndex(a => a.id === atendimentoAtivo.id);
    agendamentos[idx].inicio = atendimentoAtivo.inicio;
    saveData();
    document.getElementById('btnCheckIn').disabled = true;
    document.getElementById('btnCheckOut').disabled = false;
    retomarTimer();
}

function retomarTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!atendimentoAtivo?.inicio) return;
        const diff = Math.floor((new Date() - new Date(atendimentoAtivo.inicio)) / 1000);
        const h = Math.floor(diff/3600).toString().padStart(2,'0'), m = Math.floor((diff%3600)/60).toString().padStart(2,'0'), s = (diff%60).toString().padStart(2,'0');
        const el = document.getElementById('atendTimer');
        if (el) el.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function realizarCheckOut() {
    clearInterval(timerInterval);
    const fim = new Date();
    const dur = Math.floor((fim - new Date(atendimentoAtivo.inicio)) / 1000);
    const idx = agendamentos.findIndex(a => a.id === atendimentoAtivo.id);
    agendamentos[idx].finalizado = true;
    agendamentos[idx].duracaoSegundos = dur;
    agendamentos[idx].duracaoFormatada = document.getElementById('atendTimer').innerText;
    agendamentos[idx].relatorio = document.getElementById('atendRelatorio').value;
    agendamentos[idx].dataFim = fim.toISOString();
    historico.push({...agendamentos[idx]});
    saveData();
    atendimentoAtivo = null;
    toggleModal('modalAtendimento');
    switchView('dashboard');
}

function salvarObservacaoPos() {
    const obs = document.getElementById('atendObsPos').value;
    const idx = agendamentos.findIndex(a => a.id == atendimentoAtivo.id);
    if(idx !== -1) {
        agendamentos[idx].observacaoPos = obs;
        const hIdx = historico.findIndex(h => h.id == atendimentoAtivo.id);
        if(hIdx !== -1) historico[hIdx].observacaoPos = obs;
        saveData();
        alert("Nota guardada!");
        toggleModal('modalAtendimento');
    }
}

// 7. BACKUP E LISTAS (CORREÇÃO DE ESCOPO GLOBAL)
function renderListasConfig() {
    const cont = document.getElementById('listaRamosConfig');
    if (cont) cont.innerHTML = ramos.map(r => `
        <div style="display:flex; justify-content:space-between; padding:10px; background:var(--bg-secondary); border-radius:8px; margin-bottom:5px;">
            <span style="font-weight:bold;">${r.nome}</span>
            <button onclick="deletarRamo(${r.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
}

function deletarRamo(id) {
    if(confirm("Excluir ramo?")) {
        ramos = ramos.filter(r => r.id !== id);
        saveData();
        renderListasConfig();
    }
}

window.exportarDados = function() {
    try {
        const data = { clientes, agendamentos, ramos, historico };
        const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ceocard_backup_final.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) { alert("Erro: " + e.message); }
};

window.importarDados = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("Isto substituirá todos os dados. Continuar?")) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            if (d.clientes) {
                clientes = d.clientes; agendamentos = d.agendamentos || []; ramos = d.ramos || []; historico = d.historico || [];
                saveData(); location.reload();
            } else { alert("Ficheiro inválido."); }
        } catch(err) { alert("Erro de leitura."); }
    };
    reader.readAsText(file);
};

// 8. EVENTOS DE INICIALIZAÇÃO
window.onload = () => {
    initTheme();

    const formRamo = document.getElementById('formRamo');
    if (formRamo) {
        formRamo.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('ramoNome');
            if (input.value.trim()) {
                ramos.push({ id: Date.now(), nome: input.value.trim() });
                saveData();
                input.value = '';
                toggleModal('modalRamo');
                renderListasConfig();
            }
        });
    }

    const formCliente = document.getElementById('formCliente');
    if (formCliente) {
        formCliente.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('cliId').value;
            const dados = {
                id: id ? parseInt(id) : Date.now(),
                codigo: document.getElementById('cliCodigo').value,
                fantasia: document.getElementById('cliFantasia').value,
                ramo: document.getElementById('cliRamo').value,
                inativo: document.getElementById('cliInativo').checked,
                razao: document.getElementById('cliRazao').value,
                rua: document.getElementById('cliRua').value,
                numero: document.getElementById('cliNumero').value,
                bairro: document.getElementById('cliBairro').value,
                cidade: document.getElementById('cliCidade').value,
                estado: document.getElementById('cliEstado').value,
                contato: document.getElementById('cliContatoNome').value,
                telefone: document.getElementById('cliTelefone').value,
                obs: document.getElementById('cliObs').value
            };
            if (id) {
                const idx = clientes.findIndex(c => c.id == id);
                if (idx !== -1) clientes[idx] = dados;
            } else { clientes.push(dados); }
            saveData();
            toggleModal('modalCliente');
            filtrarClientes();
        });
    }

    const formAg = document.getElementById('formAgendamento');
    if (formAg) {
        formAg.addEventListener('submit', (e) => {
            e.preventDefault();
            const d = document.getElementById('ageData').value;
            agendamentos.push({
                id: Date.now(), clienteId: document.getElementById('ageCliente').value,
                data: d, hora: document.getElementById('ageHora').value,
                tipo: document.getElementById('ageTipo').value, finalizado: false
            });
            saveData(); toggleModal('modalAgendamento');
            if (dataFiltroAtual === d) renderTimeline();
        });
    }

    const pen = agendamentos.find(a => a.inicio && !a.finalizado);
    if (pen) { atendimentoAtivo = pen; retomarTimer(); }
    
    switchView('timeline');
};
