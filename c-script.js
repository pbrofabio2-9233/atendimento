// ==========================================
// CEOCARD v3.8.0 - PARTE 1 (Core, Calendário, Briefing, Dashboard)
// ==========================================

// --- ESTADO INICIAL E PERSISTÊNCIA ---
let clientes = JSON.parse(localStorage.getItem('ceocard_clientes')) || [];
let agendamentos = JSON.parse(localStorage.getItem('ceocard_agenda')) || [];
let ramos = JSON.parse(localStorage.getItem('ceocard_ramos')) || [{ id: 1, nome: 'Geral' }];
let historico = JSON.parse(localStorage.getItem('ceocard_historico')) || [];
let atendimentoAtivo = null;
let timerInterval = null;

// Filtros da Agenda
let filtroAgendaTipo = 'todas'; // 'todas', 'urgencias', 'concluidas'
let dataFiltroAtual = getLocalISODate(new Date()); // Começa no dia de hoje

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

    if (atendimentoAtivo && atendimentoAtivo.clienteId == cliente.id) {
        return STATUS_FIXOS.find(s => s.id === 'em_atendimento');
    }

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
    const titleMap = { 'timeline': 'Agenda do Dia', 'dashboard': 'Visão Geral', 'clientes': 'Gestão de Clientes', 'config': 'Ajustes do Sistema' };

    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) subtitle.innerText = titleMap[view] || "";

    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === view + '-view') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById("btn-nav-" + view);
    if (activeBtn) activeBtn.classList.add('active');

    if (view === 'timeline') {
        gerarDateStrip();
        renderTimeline();
    }
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
    const resolvidos = visitasMes.filter(v => v.statusFinal === 'Resolvido').length; 
    const inativos = clientes.filter(c => c.inativo).length;

    if(document.getElementById('stat-visitas')) document.getElementById('stat-visitas').innerText = visitasMes.length;
    if(document.getElementById('stat-horas')) document.getElementById('stat-horas').innerText = Math.floor(totalSegundos / 3600) + "h";
    if(document.getElementById('stat-resolvidos')) document.getElementById('stat-resolvidos').innerText = resolvidos || visitasMes.length;
    if(document.getElementById('stat-pendentes')) document.getElementById('stat-pendentes').innerText = inativos;

    const porc = Math.min((visitasMes.length / 20) * 100, 100);
    const fill = document.getElementById('eficiencia-fill');
    if (fill) fill.style.width = porc + "%";
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
    
    // Rola para a data selecionada suavemente
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

    const isHoje = dataFiltroAtual === getLocalISODate(new Date());
    title.innerText = isHoje ? "Resumo de Hoje" : `Resumo do dia ${dataFiltroAtual.split('-').reverse().join('/')}`;

    const total = agendaDoDia.length;
    const pendentes = agendaDoDia.filter(a => !a.finalizado).length;
    const concluidas = total - pendentes;
    const urgencias = agendaDoDia.filter(a => a.tipo.includes('Urgência') && !a.finalizado).length;

    if (total === 0) {
        card.style.display = 'flex';
        card.style.background = 'linear-gradient(135deg, #1abc9c, #16a085)';
        card.querySelector('.briefing-icon').innerHTML = '<i class="fa-solid fa-mug-hot"></i>';
        text.innerText = "Dia livre! Nenhum compromisso agendado para esta data.";
    } else if (pendentes === 0) {
        card.style.display = 'flex';
        card.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
        card.querySelector('.briefing-icon').innerHTML = '<i class="fa-solid fa-trophy"></i>';
        text.innerText = `Parabéns! Finalizaste todos os ${total} compromissos deste dia.`;
    } else {
        card.style.display = 'flex';
        card.style.background = urgencias > 0 ? 'linear-gradient(135deg, #e74c3c, #c0392b)' : 'linear-gradient(135deg, var(--brand-orange), #ff8a00)';
        card.querySelector('.briefing-icon').innerHTML = urgencias > 0 ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-bell"></i>';
        
        let msg = `Tens ${pendentes} compromisso(s) pendente(s). `;
        if (urgencias > 0) msg += `Atenção: ${urgencias} são urgências!`;
        else msg += "Bom trabalho em campo!";
        
        text.innerText = msg;
    }
}

// --- AGENDA INTERATIVA E CARDS RICOS ---
function filtrarAgenda(tipo) {
    filtroAgendaTipo = tipo;
    document.querySelectorAll('.chip-filter').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderTimeline();
}

function renderTimeline() {
    const container = document.getElementById('timelineList');
    if (!container) return;
    container.innerHTML = '';

    // Filtra primeiro pela data selecionada no Date Strip
    let agendaDoDia = agendamentos.filter(a => a.data === dataFiltroAtual);
    
    // Atualiza o painel de Briefing
    atualizarBriefingDiario(agendaDoDia);

    // Filtra adicionalmente pelo chip (Todas, Urgências, Concluídas)
    let agendaFiltrada = agendaDoDia;
    if (filtroAgendaTipo === 'urgencias') {
        agendaFiltrada = agendaDoDia.filter(a => a.tipo.includes('Urgência'));
    } else if (filtroAgendaTipo === 'concluidas') {
        agendaFiltrada = agendaDoDia.filter(a => a.finalizado);
    }

    const agenda = agendaFiltrada.sort((a, b) => new Date((a.data||'')+'T'+(a.hora||'00:00')) - new Date((b.data||'')+'T'+(b.hora||'00:00')));

    if (agenda.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-box-open" style="font-size:2rem; display:block; margin-bottom:10px;"></i> Nada a mostrar neste filtro.</p>`;
        return;
    }

    agenda.forEach(age => {
        const cli = clientes.find(c => c.id == age.clienteId);
        const item = document.createElement('div');
        item.className = 'timeline-item' + (age.finalizado ? ' finalizado' : '');
        
        let corTipo = 'var(--info)'; 
        let iconeTipo = 'fa-tag';
        if (age.tipo.includes('Urgência')) { corTipo = 'var(--danger)'; iconeTipo = 'fa-triangle-exclamation'; }
        if (age.tipo.includes('Reunião')) { corTipo = '#8e44ad'; iconeTipo = 'fa-handshake'; }
        
        const duracaoPrevista = age.tipo.includes('Reunião') ? '30 min' : '1h30m';

        item.innerHTML = `
            <div class="timeline-header" onclick="this.parentElement.classList.toggle('active')">
                <div>
                    <strong style="display:block; font-size:1.05rem; color:var(--primary);">${cli ? cli.fantasia : 'Externo'}</strong>
                    <div style="display:flex; gap:8px; margin-top:5px; align-items:center;">
                        <span style="background:${corTipo}; color:white; font-size:0.65rem; padding:3px 8px; border-radius:6px; font-weight:bold;">
                            <i class="fa-solid ${iconeTipo}"></i> ${age.tipo}
                        </span>
                        ${!age.finalizado ? `<span style="font-size:0.7rem; color:var(--text-muted);"><i class="fa-regular fa-clock"></i> Est. ${duracaoPrevista}</span>` : ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <strong style="color:var(--primary); font-size:1.2rem; font-weight:900;">${age.hora || '--:--'}</strong>
                    ${age.finalizado ? '<i class="fa-solid fa-circle-check" style="color:var(--success); margin-left:8px; font-size:1.2rem;"></i>' : '<i class="fa-solid fa-chevron-down" style="margin-left:8px; color:var(--text-muted);"></i>'}
                </div>
            </div>
            <div class="timeline-body">
                <div style="font-size:0.85rem; color:var(--text-main); margin-bottom:15px; background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="margin-bottom:6px;"><i class="fa-solid fa-map-location-dot" style="color:var(--text-muted); width:20px;"></i> <strong>Endereço:</strong> ${cli ? (cli.rua || 'N/A') : '---'}</div>
                    <div style="margin-bottom:6px;"><i class="fa-solid fa-address-book" style="color:var(--text-muted); width:20px;"></i> <strong>Contato:</strong> ${cli ? (cli.contato || 'N/A') : '---'}</div>
                    ${cli && cli.telefone ? `<div><i class="fa-brands fa-whatsapp" style="color:#25D366; width:20px;"></i> <strong>Tel:</strong> ${cli.telefone}</div>` : ''}
                </div>
                <button class="btn-save" style="width:100%; background:${age.finalizado ? 'var(--success)' : 'var(--brand-orange)'}; box-shadow:0 4px 6px rgba(0,0,0,0.1);" 
                        onclick="abrirAtendimento(${age.id})">
                    <i class="fa-solid ${age.finalizado ? 'fa-book-open' : 'fa-play'}"></i> 
                    ${age.finalizado ? 'Ver Registro do Atendimento' : 'Iniciar Atendimento'}
                </button>
            </div>`;
        container.appendChild(item);
    });
}
// ==================== FIM DA PARTE 1 ====================
// ==========================================
// CEOCARD v3.8.0 - PARTE 2 (Atendimento, Clientes, Ajustes e Lógica)
// ==========================================

// --- ATENDIMENTO (CHECK-IN / OUT SIMPLIFICADO) ---

function abrirAtendimento(id) {
    const age = agendamentos.find(a => a.id == id);
    if (!age) return;
    atendimentoAtivo = age;
    const cli = clientes.find(c => c.id == age.clienteId);

    document.getElementById('atendClienteNome').innerText = cli ? cli.fantasia : 'Atendimento';
    document.getElementById('atendRelatorio').value = age.relatorio || '';
    document.getElementById('atendTimer').innerText = age.duracaoFormatada || '00:00:00';
    
    const isFin = age.finalizado === true;
    
    document.getElementById('badgeFinalizado').style.display = isFin ? 'inline' : 'none';
    document.getElementById('areaBotoesAtendimento').style.display = isFin ? 'none' : 'flex';
    document.getElementById('atendConfigExtras').style.display = isFin ? 'none' : 'block';
    document.getElementById('areaObservacaoPos').style.display = isFin ? 'block' : 'none';
    
    document.getElementById('atendRelatorio').disabled = isFin;
    
    if(isFin) document.getElementById('atendObsPos').value = age.observacaoPos || '';

    // Limpa os campos do próximo agendamento opcional
    const dataProx = document.getElementById('proxAgeData');
    const horaProx = document.getElementById('proxAgeHora');
    if (dataProx) dataProx.value = '';
    if (horaProx) horaProx.value = '';

    toggleModal('modalAtendimento');
}

function realizarCheckIn() {
    atendimentoAtivo.inicio = new Date();
    document.getElementById('btnCheckIn').disabled = true;
    document.getElementById('btnCheckOut').disabled = false;
    
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - atendimentoAtivo.inicio) / 1000);
        const h = Math.floor(diff/3600).toString().padStart(2,'0');
        const m = Math.floor((diff%3600)/60).toString().padStart(2,'0');
        const s = (diff%60).toString().padStart(2,'0');
        document.getElementById('atendTimer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function realizarCheckOut() {
    clearInterval(timerInterval);
    const fim = new Date();
    const duracaoSeg = Math.floor((fim - atendimentoAtivo.inicio) / 1000);
    
    const index = agendamentos.findIndex(a => a.id === atendimentoAtivo.id);
    if (index !== -1) {
        agendamentos[index].finalizado = true;
        agendamentos[index].duracaoSegundos = duracaoSeg;
        agendamentos[index].duracaoFormatada = document.getElementById('atendTimer').innerText;
        agendamentos[index].relatorio = document.getElementById('atendRelatorio').value;
        agendamentos[index].dataFim = fim;
        historico.push({...agendamentos[index]});
    }

    const cliIdx = clientes.findIndex(c => c.id == atendimentoAtivo.clienteId);
    if (cliIdx !== -1) {
        clientes[cliIdx].ultimoAtendimento = fim;
    }

    // Processa agendamento opcional para o futuro
    const pD = document.getElementById('proxAgeData').value;
    const pH = document.getElementById('proxAgeHora').value;
    const pT = document.getElementById('proxAgeTipo').value;
    if (pD && pH) {
        agendamentos.push({ 
            id: Date.now() + 1, 
            clienteId: atendimentoAtivo.clienteId, 
            data: pD, 
            hora: pH, 
            tipo: pT, 
            finalizado: false 
        });
    }

    saveData();
    localStorage.setItem('ceocard_historico', JSON.stringify(historico));
    localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
    
    atendimentoAtivo = null;
    toggleModal('modalAtendimento');
    
    // Volta para o quadro ou atualiza a agenda, dependendo de onde o utilizador estava
    if(document.getElementById('timeline-view').style.display === 'flex') {
        renderTimeline();
    } else {
        switchView('dashboard'); 
    }
}

function salvarObservacaoPos() {
    const obs = document.getElementById('atendObsPos').value;
    const idx = agendamentos.findIndex(a => a.id == atendimentoAtivo.id);
    if(idx !== -1) {
        agendamentos[idx].observacaoPos = obs;
        localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
        alert("Nota adicional salva com sucesso!");
        toggleModal('modalAtendimento');
        renderTimeline();
    }
}

// --- CLIENTES: CADASTRO, EDIÇÃO E FILTROS AUTOMATIZADOS ---

function abrirModalNovoCliente() {
    document.getElementById('formCliente').reset();
    document.getElementById('cliId').value = ''; 
    document.getElementById('cliInativo').checked = false; 
    document.getElementById('modalClienteTitulo').innerHTML = '<i class="fa-solid fa-user-plus"></i> Novo Cliente';
    toggleModal('modalCliente');
}

function abrirModalEditarCliente(clienteId) {
    const cli = clientes.find(c => c.id == clienteId);
    if (!cli) return;
    
    document.getElementById('cliId').value = cli.id;
    document.getElementById('cliCodigo').value = cli.codigo || '';
    document.getElementById('cliRazao').value = cli.razao || '';
    document.getElementById('cliFantasia').value = cli.fantasia || '';
    document.getElementById('cliInativo').checked = cli.inativo === true;
    
    popularSelectRamos();
    document.getElementById('cliRamo').value = cli.ramo || '';
    
    document.getElementById('cliRua').value = cli.rua || '';
    document.getElementById('cliNumero').value = cli.numero || '';
    document.getElementById('cliBairro').value = cli.bairro || '';
    document.getElementById('cliCidade').value = cli.cidade || '';
    document.getElementById('cliEstado').value = cli.estado || '';
    document.getElementById('cliContatoNome').value = cli.contato || '';
    document.getElementById('cliTelefone').value = cli.telefone || '';
    document.getElementById('cliObs').value = cli.obs || '';

    document.getElementById('modalClienteTitulo').innerHTML = '<i class="fa-solid fa-user-pen"></i> Editar Cliente';
    toggleModal('modalCliente');
}

const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const idEdicao = document.getElementById('cliId').value;
        const dadosForm = {
            codigo: document.getElementById('cliCodigo').value,
            razao: document.getElementById('cliRazao').value,
            fantasia: document.getElementById('cliFantasia').value,
            ramo: document.getElementById('cliRamo').value,
            rua: document.getElementById('cliRua').value,
            numero: document.getElementById('cliNumero').value,
            bairro: document.getElementById('cliBairro').value,
            cidade: document.getElementById('cliCidade').value,
            estado: document.getElementById('cliEstado').value,
            contato: document.getElementById('cliContatoNome').value,
            telefone: document.getElementById('cliTelefone').value,
            obs: document.getElementById('cliObs').value,
            inativo: document.getElementById('cliInativo').checked 
        };

        if (idEdicao) {
            const idx = clientes.findIndex(c => c.id == idEdicao);
            if (idx !== -1) {
                clientes[idx] = { ...clientes[idx], ...dadosForm };
                alert("Cadastro atualizado com sucesso!");
            }
        } else {
            clientes.push({
                id: Date.now(),
                ...dadosForm,
                ultimoAtendimento: null
            });
            alert("Novo cliente cadastrado com sucesso!");
        }

        saveData();
        toggleModal('modalCliente');
        this.reset();
        switchView('clientes'); 
    });
}

function popularFiltrosClientes() {
    const selRamo = document.getElementById('filterRamo');
    if (selRamo) selRamo.innerHTML = '<option value="">Todos os Ramos</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');

    const selStatus = document.getElementById('filterStatus');
    if (selStatus) selStatus.innerHTML = '<option value="">Todos os Status</option>' + STATUS_FIXOS.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
}

function filtrarClientes() {
    const termo = (document.getElementById('searchClient') ? document.getElementById('searchClient').value.toLowerCase() : "");
    const filtroRamo = (document.getElementById('filterRamo') ? document.getElementById('filterRamo').value : "");
    const filtroStatus = (document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : "");

    const filtrados = clientes.filter(c => {
        const matchNome = c.fantasia.toLowerCase().includes(termo);
        const matchRamo = filtroRamo === "" || c.ramo === filtroRamo;
        
        let matchStatus = true;
        if (filtroStatus !== "") {
            matchStatus = calcularStatusCliente(c).id === filtroStatus;
        }
        
        return matchNome && matchRamo && matchStatus;
    });

    const container = document.getElementById('clientsList');
    if (!container) return;
    
    container.innerHTML = filtrados.map(c => {
        const diasDiff = c.ultimoAtendimento ? Math.floor((new Date() - new Date(c.ultimoAtendimento)) / (1000*60*60*24)) : '---';
        const lblTempo = diasDiff === '---' ? 'Sem registro' : `${diasDiff} dias s/ visita`;
        const corTempo = (diasDiff !== '---' && diasDiff > 30) ? 'var(--danger)' : 'var(--success)';
        
        const statusObj = calcularStatusCliente(c);

        return `
        <div class="client-item" style="background:var(--card-bg); padding:18px; border-radius:16px; margin-bottom:12px; box-shadow:var(--shadow-sm); border-left:5px solid var(--info); opacity: ${c.inativo ? '0.6' : '1'}; border-right: 1px solid var(--border-color); border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong style="font-size:1.1rem; color:var(--primary);">${c.fantasia}</strong>
                    <button style="background:none; border:none; color:var(--text-muted); margin-left:5px; cursor:pointer;" onclick="abrirModalEditarCliente(${c.id})" title="Editar"><i class="fa-solid fa-pen"></i></button><br>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">
                        <i class="fa-solid fa-briefcase"></i> ${c.ramo || 'Geral'} | <i class="fa-solid fa-city"></i> ${c.cidade || 'N/A'}
                    </div>
                    <div style="margin-top:8px; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:0.75rem; font-weight:bold; color:${corTempo};">
                            <i class="fa-solid fa-clock-rotate-left"></i> ${lblTempo}
                        </span>
                        <span class="status-chip ${statusObj.classe}" style="margin:0; font-size:0.6rem;">${statusObj.nome}</span>
                    </div>
                </div>
                <button class="btn-outline" onclick="verHistoricoCliente(${c.id})">
                    <i class="fa-solid fa-list-ul"></i> Histórico
                </button>
            </div>
        </div>
        `;
    }).join('');

    if (filtrados.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum cliente encontrado.</p>';
    }
}

// --- CONFIGURAÇÕES: RENDERIZAR APENAS RAMOS ---

function renderListasConfig() {
    const contRamos = document.getElementById('listaRamosConfig');
    if (contRamos) {
        contRamos.innerHTML = ramos.map(r => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:12px 15px; border-radius:12px; border-left:4px solid var(--brand-orange); color:var(--text-main); font-weight:bold;">
                <span>${r.nome}</span>
                <i class="fa-solid fa-trash" style="color:var(--danger); cursor:pointer; font-size: 1.1rem;" onclick="deletarRamo(${r.id})"></i>
            </div>
        `).join('');
    }
}

function deletarRamo(id) {
    if(confirm("Tem a certeza que deseja excluir este ramo?")) {
        ramos = ramos.filter(r => r.id !== id);
        localStorage.setItem('ceocard_ramos', JSON.stringify(ramos));
        renderListasConfig();
    }
}

const formRamo = document.getElementById('formRamo');
if(formRamo) {
    formRamo.addEventListener('submit', function(e) {
        e.preventDefault();
        ramos.push({ id: Date.now(), nome: document.getElementById('ramoNome').value });
        localStorage.setItem('ceocard_ramos', JSON.stringify(ramos));
        this.reset(); 
        toggleModal('modalRamo');
        renderListasConfig();
    });
}

// --- AGENDAMENTO COM CÁLCULO INTELIGENTE DE CONFLITOS ---

function horaParaMinutos(horaStr) {
    const partes = horaStr.split(':');
    return parseInt(partes[0]) * 60 + parseInt(partes[1]);
}

const formAgendamento = document.getElementById('formAgendamento');
if(formAgendamento) {
    formAgendamento.addEventListener('submit', function(e) {
        e.preventDefault();
        const dataSelecionada = document.getElementById('ageData').value;
        const horaSelecionada = document.getElementById('ageHora').value;
        const tipoSelecionado = document.getElementById('ageTipo').value;

        // Duração: 30min para Reunião, 90min para Visita
        const duracaoNova = tipoSelecionado.includes('Reunião') ? 30 : 90;
        const inicioNovo = horaParaMinutos(horaSelecionada);
        const fimNovo = inicioNovo + duracaoNova;

        let conflitoEncontrado = null;
        let fimDoConflitoMinutos = 0;

        for (let i = 0; i < agendamentos.length; i++) {
            const ag = agendamentos[i];
            if (ag.data === dataSelecionada && !ag.finalizado) {
                const duracaoExistente = ag.tipo.includes('Reunião') ? 30 : 90;
                const inicioExistente = horaParaMinutos(ag.hora);
                const fimExistente = inicioExistente + duracaoExistente;

                if (inicioNovo < fimExistente && fimNovo > inicioExistente) {
                    conflitoEncontrado = ag;
                    fimDoConflitoMinutos = fimExistente;
                    break;
                }
            }
        }
        
        if (conflitoEncontrado) {
            const hDisp = Math.floor(fimDoConflitoMinutos / 60).toString().padStart(2, '0');
            const mDisp = (fimDoConflitoMinutos % 60).toString().padStart(2, '0');
            const horaDisponivel = `${hDisp}:${mDisp}`;

            document.getElementById('msgConflitoTexto').innerText = `Horário disponível a partir das ${horaDisponivel}`;
            document.getElementById('alertaConflito').style.display = 'block';
            return;
        } else {
            document.getElementById('alertaConflito').style.display = 'none';
        }

        agendamentos.push({
            id: Date.now(),
            clienteId: document.getElementById('ageCliente').value,
            data: dataSelecionada,
            hora: horaSelecionada,
            tipo: tipoSelecionado,
            finalizado: false
        });
        localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
        toggleModal('modalAgendamento'); 
        this.reset();
        
        // Renderiza automaticamente dependendo de onde o utilizador estiver
        if(document.getElementById('timeline-view').style.display === 'flex') {
            // Se agendou para um dia diferente do que está a ver, muda o filtro para esse dia
            if (dataFiltroAtual !== dataSelecionada) {
                dataFiltroAtual = dataSelecionada;
                gerarDateStrip();
            }
            renderTimeline();
        } else if(document.getElementById('dashboard-view').style.display === 'flex') {
            renderBoard(); 
        }
    });
}

// --- AUXILIARES GERAIS ---

function popularSelectRamos() {
    const sel = document.getElementById('cliRamo');
    if (sel) sel.innerHTML = '<option value="">Selecionar Ramo...</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');
}

function popularSelectClientes() {
    const sel = document.getElementById('ageCliente');
    const clientesAtivos = clientes.filter(c => !c.inativo);
    if (sel) sel.innerHTML = '<option value="">Selecionar Cliente...</option>' + clientesAtivos.map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
}

function saveData() {
    localStorage.setItem('ceocard_clientes', JSON.stringify(clientes));
}

// INICIALIZAÇÃO DA APLICAÇÃO
window.onload = () => {
    initTheme(); 
    switchView('timeline'); 
};
