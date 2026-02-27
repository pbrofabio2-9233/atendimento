// --- ESTADO INICIAL E PERSISTÊNCIA ---
let clientes = JSON.parse(localStorage.getItem('ceocard_clientes')) || [];
let categorias = JSON.parse(localStorage.getItem('ceocard_categorias')) || [
    { id: 1, nome: 'Agendado', cor: '#0079bf' },
    { id: 2, nome: 'Em Atendimento', cor: '#f2d600' },
    { id: 3, nome: 'Resolvido', cor: '#61bd4f' }
];
let agendamentos = JSON.parse(localStorage.getItem('ceocard_agenda')) || [];
let ramos = JSON.parse(localStorage.getItem('ceocard_ramos')) || [{ id: 1, nome: 'Geral' }];
let historico = JSON.parse(localStorage.getItem('ceocard_historico')) || [];
let atendimentoAtivo = null;
let timerInterval = null;

// --- NAVEGAÇÃO E SUBTÍTULOS (PONTOS 3 E 4) ---

function switchView(view) {
    const views = ['timeline-view', 'dashboard-view', 'clientes-view', 'config-view'];
    const titleMap = { 
        'timeline': 'Agenda do Dia', 
        'dashboard': 'Indicadores e Quadro', 
        'clientes': 'Gestão de Clientes', 
        'config': 'Menu de Cadastros' 
    };

    // Atualiza Subtítulo
    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) subtitle.innerText = titleMap[view] || "";

    // Alterna Visibilidade das Seções
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === view + '-view') ? 'flex' : 'none';
    });

    // Atualiza Estado do Menu Inferior
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById("btn-nav-" + view);
    if (activeBtn) activeBtn.classList.add('active');

    // Gatilhos de Renderização
    if (view === 'timeline') renderTimeline();
    if (view === 'dashboard') { renderDashboard(); renderBoard(); }
    if (view === 'clientes') renderClientes();
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const isVisible = modal.style.display === "flex";
    modal.style.display = isVisible ? "none" : "flex";

    if (!isVisible) {
        if (modalId === 'modalCliente') popularSelectRamos();
        if (modalId === 'modalAgendamento') popularSelectClientes();
        if (modalId === 'modalAtendimento') popularStatusFinal();
    }
}

// --- DASHBOARD: KPIs E QUADRO (PONTO 1) ---

function renderDashboard() {
    const agora = new Date();
    const mesAtual = agora.getMonth();
    
    // Filtros para o Dashboard
    const visitasMes = historico.filter(h => new Date(h.dataFim).getMonth() === mesAtual);
    const totalSegundos = visitasMes.reduce((acc, curr) => acc + (curr.duracaoSegundos || 0), 0);
    const resolvidos = visitasMes.filter(v => v.statusFinal === 'Resolvido').length;
    
    // Cálculo de Pendentes (> 30 dias sem visita)
    const pendentes = clientes.filter(c => {
        if (!c.ultimoAtendimento) return true;
        const diff = Math.floor((agora - new Date(c.ultimoAtendimento)) / (1000 * 60 * 60 * 24));
        return diff > 30;
    }).length;

    // Atualiza UI
    if(document.getElementById('stat-visitas')) document.getElementById('stat-visitas').innerText = visitasMes.length;
    if(document.getElementById('stat-horas')) document.getElementById('stat-horas').innerText = Math.floor(totalSegundos / 3600) + "h";
    if(document.getElementById('stat-resolvidos')) document.getElementById('stat-resolvidos').innerText = resolvidos;
    if(document.getElementById('stat-pendentes')) document.getElementById('stat-pendentes').innerText = pendentes;

    // Barra de Eficiência (Meta: 20 visitas)
    const porc = Math.min((visitasMes.length / 20) * 100, 100);
    const fill = document.getElementById('eficiencia-fill');
    if (fill) fill.style.width = porc + "%";
    const label = document.getElementById('eficiencia-label');
    if (label) label.innerText = `${Math.floor(porc)}% da meta atingida`;
}

function renderBoard() {
    const container = document.getElementById('board-container-inner');
    if (!container) return;
    container.innerHTML = '';

    categorias.forEach(cat => {
        const col = document.createElement('div');
        col.className = 'column';
        const filtrados = clientes.filter(c => c.statusId == cat.id);
        
        col.innerHTML = `<h3>${cat.nome} <small>(${filtrados.length})</small></h3>`;
        
        filtrados.forEach(cli => {
            col.innerHTML += `
                <div class="card">
                    <span class="chip" style="background:${cat.cor}">${cat.nome}</span>
                    <strong style="display:block;">${cli.fantasia}</strong>
                    <small style="color:#7f8c8d;">${cli.ramo || 'Geral'}</small>
                </div>`;
        });
        container.appendChild(col);
    });
}

// --- TIMELINE PERSISTENTE (ACCORDION) ---

function renderTimeline() {
    const container = document.getElementById('timelineList');
    if (!container) return;
    container.innerHTML = '';

    const agenda = agendamentos.sort((a, b) => new Date(a.data + 'T' + a.hora) - new Date(b.data + 'T' + b.hora));

    if (agenda.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:30px; color:#999;">Agenda vazia.</p>';
        return;
    }

    agenda.forEach(age => {
        const cli = clientes.find(c => c.id == age.clienteId);
        const item = document.createElement('div');
        item.className = 'timeline-item' + (age.finalizado ? ' finalizado' : '');
        item.innerHTML = `
            <div class="timeline-header" onclick="this.parentElement.classList.toggle('active')">
                <div>
                    <strong>${cli ? cli.fantasia : 'Externo'}</strong>
                    <small style="display:block; color:#7f8c8d;">${age.tipo} - ${age.data}</small>
                </div>
                <div style="text-align:right;">
                    <strong>${age.hora}</strong>
                    ${age.finalizado ? '<i class="fa-solid fa-circle-check" style="color:#27ae60; margin-left:5px;"></i>' : ''}
                </div>
            </div>
            <div class="timeline-body">
                <p><i class="fa-solid fa-map-location-dot"></i> ${cli ? (cli.rua || 'S/ Endereço') : '---'}</p>
                <button class="btn-save" style="width:100%; background:${age.finalizado ? '#27ae60' : '#3498db'};" 
                        onclick="abrirAtendimento(${age.id})">
                    ${age.finalizado ? 'Ver Registro / Notas' : 'Iniciar Atendimento'}
                </button>
            </div>`;
        container.appendChild(item);
    });
}

// --- ATENDIMENTO (CHECK-IN / OUT) ---

function abrirAtendimento(id) {
    const age = agendamentos.find(a => a.id == id);
    if (!age) return;
    atendimentoAtivo = age;
    const cli = clientes.find(c => c.id == age.clienteId);

    document.getElementById('atendClienteNome').innerText = cli ? cli.fantasia : 'Visita';
    document.getElementById('atendRelatorio').value = age.relatorio || '';
    document.getElementById('atendTimer').innerText = age.duracaoFormatada || '00:00:00';
    
    const isFin = age.finalizado === true;
    document.getElementById('badgeFinalizado').style.display = isFin ? 'inline' : 'none';
    document.getElementById('areaBotoesAtendimento').style.display = isFin ? 'none' : 'flex';
    document.getElementById('atendConfigExtras').style.display = isFin ? 'none' : 'block';
    document.getElementById('areaObservacaoPos').style.display = isFin ? 'block' : 'none';
    
    document.getElementById('atendRelatorio').disabled = isFin;
    document.getElementById('atendStatusFinal').disabled = isFin;
    
    if(isFin) document.getElementById('atendObsPos').value = age.observacaoPos || '';

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
        agendamentos[index].statusFinal = document.getElementById('atendStatusFinal').value;
        agendamentos[index].dataFim = fim;
        historico.push({...agendamentos[index]});
    }

    // Atualização do Cliente
    const cliIdx = clientes.findIndex(c => c.id == atendimentoAtivo.clienteId);
    if (cliIdx !== -1) {
        clientes[cliIdx].ultimoAtendimento = fim;
        const cat = categorias.find(c => c.nome === agendamentos[index].statusFinal);
        if (cat) clientes[cliIdx].statusId = cat.id;
    }

    // Reagendamento Automático
    const pD = document.getElementById('proxAgeData').value;
    const pH = document.getElementById('proxAgeHora').value;
    if (pD && pH) {
        agendamentos.push({ id: Date.now(), clienteId: atendimentoAtivo.clienteId, data: pD, hora: pH, tipo: "Reagendado", finalizado: false });
    }

    saveData();
    localStorage.setItem('ceocard_historico', JSON.stringify(historico));
    localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
    toggleModal('modalAtendimento');
    switchView('dashboard');
}

function salvarObservacaoPos() {
    const obs = document.getElementById('atendObsPos').value;
    const idx = agendamentos.findIndex(a => a.id == atendimentoAtivo.id);
    if(idx !== -1) {
        agendamentos[idx].observacaoPos = obs;
        localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
        alert("Nota adicional salva!");
        toggleModal('modalAtendimento');
        renderTimeline();
    }
}

// --- CADASTRO COMPLETO DE CLIENTES (REGRA 5 & 6) ---

const formCliente = document.getElementById('formCliente');
if(formCliente) {
    formCliente.addEventListener('submit', function(e) {
        e.preventDefault();
        clientes.push({
            id: Date.now(),
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
            statusId: categorias[0].id
        });
        saveData();
        toggleModal('modalCliente');
        this.reset();
        switchView('dashboard');
    });
}

// --- AUXILIARES E POPULA SELECTS ---

function popularSelectRamos() {
    const sel = document.getElementById('cliRamo');
    if (sel) sel.innerHTML = '<option value="">Selecionar Ramo...</option>' + ramos.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');
}

function popularSelectClientes() {
    const sel = document.getElementById('ageCliente');
    if (sel) sel.innerHTML = '<option value="">Selecionar Cliente...</option>' + clientes.map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
}

function popularStatusFinal() {
    const sel = document.getElementById('atendStatusFinal');
    if (sel) sel.innerHTML = categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
}

function renderClientes() {
    const container = document.getElementById('clientsList');
    if (!container) return;
    container.innerHTML = clientes.map(c => `
        <div class="client-item" style="background:white; padding:15px; border-radius:10px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.05); border-left:4px solid #3498db;">
            <strong>${c.fantasia}</strong><br>
            <small style="color:#7f8c8d;">${c.ramo} | ${c.cidade || '---'}</small>
        </div>
    `).join('');
}

function saveData() {
    localStorage.setItem('ceocard_clientes', JSON.stringify(clientes));
    localStorage.setItem('ceocard_categorias', JSON.stringify(categorias));
}

// --- FORMULÁRIOS RESTANTES ---
const formRamo = document.getElementById('formRamo');
if(formRamo) {
    formRamo.addEventListener('submit', function(e) {
        e.preventDefault();
        ramos.push({ id: Date.now(), nome: document.getElementById('ramoNome').value });
        localStorage.setItem('ceocard_ramos', JSON.stringify(ramos));
        this.reset(); renderRamos();
    });
}

const formAgendamento = document.getElementById('formAgendamento');
if(formAgendamento) {
    formAgendamento.addEventListener('submit', function(e) {
        e.preventDefault();
        agendamentos.push({
            id: Date.now(),
            clienteId: document.getElementById('ageCliente').value,
            data: document.getElementById('ageData').value,
            hora: document.getElementById('ageHora').value,
            tipo: document.getElementById('ageTipo').value,
            finalizado: false
        });
        localStorage.setItem('ceocard_agenda', JSON.stringify(agendamentos));
        toggleModal('modalAgendamento'); renderTimeline();
    });
}

window.onload = () => switchView('timeline');