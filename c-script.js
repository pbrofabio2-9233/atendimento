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

// --- NAVEGAÇÃO E SUBTÍTULOS ---

function switchView(view) {
    const views = ['timeline-view', 'dashboard-view', 'clientes-view', 'config-view'];
    const titleMap = { 
        'timeline': 'Agenda do Dia', 
        'dashboard': 'Visão Geral e Operação', 
        'clientes': 'Gestão de Clientes', 
        'config': 'Configurações de Sistema' 
    };

    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) subtitle.innerText = titleMap[view] || "";

    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === view + '-view') ? 'flex' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById("btn-nav-" + view);
    if (activeBtn) activeBtn.classList.add('active');

    if (view === 'timeline') renderTimeline();
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
            if (alerta) alerta.style.display = 'none'; // Limpa alerta ao abrir
        }
        if (modalId === 'modalAtendimento') popularStatusFinal();
    }
}

// --- FUNÇÕES DE BACKUP (EXPORTAR / IMPORTAR) ---

function exportarDados() {
    const backup = { clientes, categorias, agendamentos, ramos, historico, dataBackup: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceocard_backup_${new Date().toLocaleDateString().replace(/\//g,'-')}.json`;
    a.click();
    alert("✅ Backup exportado com sucesso!");
}

function importarDados(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (confirm("⚠️ ATENÇÃO: Isto substituirá todos os seus dados atuais. Deseja continuar?")) {
                localStorage.setItem('ceocard_clientes', JSON.stringify(data.clientes || []));
                localStorage.setItem('ceocard_categorias', JSON.stringify(data.categorias || []));
                localStorage.setItem('ceocard_agenda', JSON.stringify(data.agendamentos || []));
                localStorage.setItem('ceocard_ramos', JSON.stringify(data.ramos || []));
                localStorage.setItem('ceocard_historico', JSON.stringify(data.historico || []));
                alert("🚀 Dados restaurados com sucesso! O sistema será recarregado.");
                location.reload();
            }
        } catch (err) {
            alert("❌ Ficheiro inválido ou corrompido.");
        }
    };
    reader.readAsText(file);
}

// --- HISTÓRICO POR CLIENTE ---

function verHistoricoCliente(clienteId) {
    const cli = clientes.find(c => c.id == clienteId);
    const lista = historico.filter(h => h.clienteId == clienteId).sort((a,b) => new Date(b.dataFim) - new Date(a.dataFim));
    
    document.getElementById('histClienteNome').innerText = cli ? `Histórico: ${cli.fantasia}` : 'Histórico do Cliente';
    const container = document.getElementById('histLista');
    container.innerHTML = '';

    if (lista.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum atendimento registado para este cliente.</p>';
    } else {
        lista.forEach(h => {
            const dataObj = new Date(h.dataFim);
            const dataStr = `${dataObj.getDate().toString().padStart(2,'0')}/${(dataObj.getMonth()+1).toString().padStart(2,'0')}/${dataObj.getFullYear()} às ${dataObj.getHours().toString().padStart(2,'0')}:${dataObj.getMinutes().toString().padStart(2,'0')}`;
            container.innerHTML += `
                <div class="history-item">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <strong style="color:#2c3e50;">${dataStr}</strong>
                        <span style="font-size:0.75rem; background:#e2e8f0; padding:3px 8px; border-radius:12px; color:#2c3e50;">${h.duracaoFormatada || '---'}</span>
                    </div>
                    <p style="font-size:0.85rem; margin:8px 0; color:#4a5568;">${h.relatorio || '<em>Sem relatório registado.</em>'}</p>
                    <div style="margin-top:8px;">
                        <small style="background:#27ae60; color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">${h.statusFinal || 'Resolvido'}</small>
                    </div>
                    ${h.observacaoPos ? `<div style="margin-top:10px; border-top:1px dashed #cbd5e0; padding-top:8px; font-size:0.8rem; color:#2980b9;"><strong>Nota Adicional:</strong> ${h.observacaoPos}</div>` : ''}
                </div>
            `;
        });
    }
    toggleModal('modalHistorico');
}

// --- DASHBOARD E QUADRO EVOLUÍDO ---

function renderDashboard() {
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();
    
    const visitasMes = historico.filter(h => {
        const d = new Date(h.dataFim);
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
    
    const totalSegundos = visitasMes.reduce((acc, curr) => acc + (curr.duracaoSegundos || 0), 0);
    const resolvidos = visitasMes.filter(v => v.statusFinal === 'Resolvido').length;
    
    const pendentes = clientes.filter(c => {
        if (!c.ultimoAtendimento) return true;
        const diff = Math.floor((agora - new Date(c.ultimoAtendimento)) / (1000 * 60 * 60 * 24));
        return diff > 30;
    }).length;

    if(document.getElementById('stat-visitas')) document.getElementById('stat-visitas').innerText = visitasMes.length;
    if(document.getElementById('stat-horas')) document.getElementById('stat-horas').innerText = Math.floor(totalSegundos / 3600) + "h";
    if(document.getElementById('stat-resolvidos')) document.getElementById('stat-resolvidos').innerText = resolvidos;
    if(document.getElementById('stat-pendentes')) document.getElementById('stat-pendentes').innerText = pendentes;

    const porc = Math.min((visitasMes.length / 20) * 100, 100);
    const fill = document.getElementById('eficiencia-fill');
    if (fill) fill.style.width = porc + "%";
    const label = document.getElementById('eficiencia-label');
    if (label) label.innerText = `Eficiência Mensal (${Math.floor(porc)}% da meta)`;
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
            const agendaAtiva = agendamentos.find(a => a.clienteId == cli.id && !a.finalizado);
            let agendaHtml = '';
            
            if (agendaAtiva) {
                let corTipo = '#3498db'; 
                if (agendaAtiva.tipo === 'Urgência') corTipo = '#e74c3c';
                if (agendaAtiva.tipo === 'Reunião') corTipo = '#8e44ad';
                
                const dataFormatada = agendaAtiva.data.split('-').reverse().join('/');
                agendaHtml = `
                    <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ddd; font-size:0.75rem; color:#555;">
                        <span class="chip" style="background:${corTipo}; font-size:0.6rem;">${agendaAtiva.tipo}</span>
                        <div style="margin-top:5px; font-weight:bold;"><i class="fa-solid fa-clock"></i> ${dataFormatada} às ${agendaAtiva.hora}</div>
                    </div>
                `;
            }

            col.innerHTML += `
                <div class="card">
                    <span class="chip" style="background:${cat.cor}">${cat.nome}</span>
                    <strong style="display:block; margin-top:5px; color:#2c3e50;">${cli.fantasia}</strong>
                    <div style="font-size:0.7rem; color:#7f8c8d; margin-top:5px;">
                        <i class="fa-solid fa-briefcase"></i> ${cli.ramo || 'Geral'}
                    </div>
                    ${agendaHtml}
                </div>`;
        });
        container.appendChild(col);
    });
}

// --- TIMELINE ACCORDION E PERSISTÊNCIA ---

function renderTimeline() {
    const container = document.getElementById('timelineList');
    if (!container) return;
    container.innerHTML = '';

    const agenda = agendamentos.sort((a, b) => {
        const dataA = new Date((a.data || '') + 'T' + (a.hora || '00:00'));
        const dataB = new Date((b.data || '') + 'T' + (b.hora || '00:00'));
        return dataA - dataB;
    });

    if (agenda.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:30px; color:#999;">Agenda do dia livre. Use o botão (+) para agendar.</p>';
        return;
    }

    agenda.forEach(age => {
        const cli = clientes.find(c => c.id == age.clienteId);
        const item = document.createElement('div');
        item.className = 'timeline-item' + (age.finalizado ? ' finalizado' : '');
        
        let corTipo = '#3498db'; 
        if (age.tipo.includes('Urgência')) corTipo = '#e74c3c';
        if (age.tipo.includes('Reunião')) corTipo = '#8e44ad';

        item.innerHTML = `
            <div class="timeline-header" onclick="this.parentElement.classList.toggle('active')">
                <div>
                    <strong style="display:block; font-size:1.05rem; color:#2c3e50;">${cli ? cli.fantasia : 'Externo'}</strong>
                    <small style="display:block; color:${corTipo}; margin-top:3px; font-weight:bold;"><i class="fa-solid fa-tag"></i> ${age.tipo}</small>
                </div>
                <div style="text-align:right;">
                    <strong style="color:#2980b9;">${age.hora || '--:--'}</strong>
                    ${age.finalizado ? '<i class="fa-solid fa-circle-check" style="color:#27ae60; margin-left:8px; font-size:1.1rem;"></i>' : '<i class="fa-solid fa-chevron-down" style="margin-left:8px; color:#bdc3c7;"></i>'}
                </div>
            </div>
            <div class="timeline-body">
                <div style="font-size:0.85rem; color:#555; margin-bottom:15px; background:#f4f7f6; padding:10px; border-radius:6px;">
                    <div style="margin-bottom:5px;"><i class="fa-solid fa-calendar-day" style="color:#7f8c8d; width:20px;"></i> <strong>Data:</strong> ${age.data.split('-').reverse().join('/')}</div>
                    <div style="margin-bottom:5px;"><i class="fa-solid fa-map-location-dot" style="color:#7f8c8d; width:20px;"></i> <strong>Endereço:</strong> ${cli ? (cli.rua || 'Não informado') : '---'}</div>
                    <div><i class="fa-solid fa-address-book" style="color:#7f8c8d; width:20px;"></i> <strong>Contato:</strong> ${cli ? (cli.contato || 'Não informado') : '---'}</div>
                </div>
                <button class="btn-save" style="width:100%; background:${age.finalizado ? '#27ae60' : '#3498db'}; box-shadow:0 4px 6px rgba(0,0,0,0.1);" 
                        onclick="abrirAtendimento(${age.id})">
                    <i class="fa-solid ${age.finalizado ? 'fa-book-open' : 'fa-play'}"></i> 
                    ${age.finalizado ? 'Ver Registro do Atendimento' : 'Iniciar Atendimento'}
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

    document.getElementById('atendClienteNome').innerText = cli ? cli.fantasia : 'Atendimento';
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

    document.getElementById('proxAgeData').value = '';
    document.getElementById('proxAgeHora').value = '';

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

    const cliIdx = clientes.findIndex(c => c.id == atendimentoAtivo.clienteId);
    if (cliIdx !== -1) {
        clientes[cliIdx].ultimoAtendimento = fim;
        const cat = categorias.find(c => c.nome === agendamentos[index].statusFinal);
        if (cat) clientes[cliIdx].statusId = cat.id;
    }

    const pD = document.getElementById('proxAgeData').value;
    const pH = document.getElementById('proxAgeHora').value;
    if (pD && pH) {
        agendamentos.push({ id: Date.now() + 1, clienteId: atendimentoAtivo.clienteId, data: pD, hora: pH, tipo: "Visita de Rotina", finalizado: false });
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
        alert("Nota adicional salva com sucesso!");
        toggleModal('modalAtendimento');
        renderTimeline();
    }
}

// --- CLIENTES: CADASTRO, EDIÇÃO E FILTROS ---

function abrirModalNovoCliente() {
    document.getElementById('formCliente').reset();
    document.getElementById('cliId').value = ''; 
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
            obs: document.getElementById('cliObs').value
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
                statusId: null, 
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
    if (selStatus) selStatus.innerHTML = '<option value="">Todos os Status</option>' + categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
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
            matchStatus = c.statusId == filtroStatus;
        }
        return matchNome && matchRamo && matchStatus;
    });

    const container = document.getElementById('clientsList');
    if (!container) return;
    
    container.innerHTML = filtrados.map(c => {
        const diasDiff = c.ultimoAtendimento ? Math.floor((new Date() - new Date(c.ultimoAtendimento)) / (1000*60*60*24)) : '---';
        const lblTempo = diasDiff === '---' ? 'Sem registro' : `${diasDiff} dias s/ visita`;
        const corTempo = (diasDiff !== '---' && diasDiff > 30) ? '#e74c3c' : '#27ae60';
        
        return `
        <div class="client-item" style="background:white; padding:18px; border-radius:12px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); border-left:5px solid #3498db;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong style="font-size:1.1rem; color:#2c3e50;">${c.fantasia}</strong>
                    <button style="background:none; border:none; color:#95a5a6; margin-left:5px; cursor:pointer;" onclick="abrirModalEditarCliente(${c.id})" title="Editar"><i class="fa-solid fa-pen"></i></button><br>
                    <div style="font-size:0.8rem; color:#7f8c8d; margin-top:5px;">
                        <i class="fa-solid fa-briefcase"></i> ${c.ramo || 'Geral'} | <i class="fa-solid fa-city"></i> ${c.cidade || 'N/A'}
                    </div>
                    <div style="font-size:0.75rem; font-weight:bold; color:${corTempo}; margin-top:8px;">
                        <i class="fa-solid fa-clock-rotate-left"></i> ${lblTempo}
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
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum cliente encontrado.</p>';
    }
}

// --- CONFIGURAÇÕES: RENDERIZAR LISTAS VISÍVEIS ---

function renderListasConfig() {
    const contRamos = document.getElementById('listaRamosConfig');
    if (contRamos) {
        contRamos.innerHTML = ramos.map(r => `
            <div style="display:flex; justify-content:space-between; background:#f8f9fa; padding:10px 15px; border-radius:8px; border-left:3px solid #3498db;">
                <span>${r.nome}</span>
                <i class="fa-solid fa-trash" style="color:#e74c3c; cursor:pointer;" onclick="deletarRamo(${r.id})"></i>
            </div>
        `).join('');
    }

    const contCat = document.getElementById('listaCategoriasConfig');
    if (contCat) {
        contCat.innerHTML = categorias.map(c => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8f9fa; padding:10px 15px; border-radius:8px; border-left:4px solid ${c.cor};">
                <span>${c.nome}</span>
                <i class="fa-solid fa-trash" style="color:#e74c3c; cursor:pointer;" onclick="deletarCategoria(${c.id})"></i>
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

function deletarCategoria(id) {
    if(confirm("Excluir status? Clientes com este status ficarão 'Sem Status' no Quadro.")) {
        categorias = categorias.filter(c => c.id !== id);
        clientes.forEach(c => { if(c.statusId == id) c.statusId = null; });
        saveData();
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

const formCategoria = document.getElementById('formCategoria');
if(formCategoria) {
    formCategoria.addEventListener('submit', function(e) {
        e.preventDefault();
        categorias.push({ id: Date.now(), nome: document.getElementById('catNome').value, cor: document.getElementById('catCor').value });
        localStorage.setItem('ceocard_categorias', JSON.stringify(categorias));
        this.reset();
        toggleModal('modalCategoria');
        renderListasConfig();
    });
}

// --- AGENDAMENTO COM CÁLCULO INTELIGENTE DE CONFLITOS (ATUALIZADO) ---

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

                // Verifica se há sobreposição de horário
                if (inicioNovo < fimExistente && fimNovo > inicioExistente) {
                    conflitoEncontrado = ag;
                    fimDoConflitoMinutos = fimExistente;
                    break;
                }
            }
        }
        
        if (conflitoEncontrado) {
            // Formata os minutos de volta para HH:MM
            const hDisp = Math.floor(fimDoConflitoMinutos / 60).toString().padStart(2, '0');
            const mDisp = (fimDoConflitoMinutos % 60).toString().padStart(2, '0');
            const horaDisponivel = `${hDisp}:${mDisp}`;

            document.getElementById('msgConflitoTexto').innerText = `Horário disponível a partir das ${horaDisponivel}`;
            document.getElementById('alertaConflito').style.display = 'block';
            return; // Impede o cadastro e para a execução
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
        
        if(document.getElementById('timeline-view').style.display === 'flex') {
            renderTimeline();
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
    if (sel) sel.innerHTML = '<option value="">Selecionar Cliente...</option>' + clientes.map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
}

function popularStatusFinal() {
    const sel = document.getElementById('atendStatusFinal');
    if (sel) sel.innerHTML = categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
}

function saveData() {
    localStorage.setItem('ceocard_clientes', JSON.stringify(clientes));
    localStorage.setItem('ceocard_categorias', JSON.stringify(categorias));
}

window.onload = () => switchView('timeline');
