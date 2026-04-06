// =============================================
// RIFA HEINEKEN — Painel Administrativo
// =============================================

let isLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-login-form').addEventListener('submit', login);
});

// ── Login com hash SHA-256 ──
async function login(e) {
    e.preventDefault();
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const btn = document.querySelector('.btn-login');

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    const inputHash = await sha256(`${user}:${pass}`);

    if (inputHash === ADMIN_HASH) {
        isLoggedIn = true;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        loadAdmin();
        subscribeAdminRealtime();
    } else {
        document.getElementById('login-error').textContent = 'Usuário ou senha incorretos';
    }

    btn.disabled = false;
    btn.textContent = 'Entrar';
}

function logout() {
    isLoggedIn = false;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-login-form').reset();
    document.getElementById('login-error').textContent = '';
}

// ── Carregar dashboard ──
async function loadAdmin() {
    const { data, error } = await supabaseClient
        .from('rifa_numeros')
        .select('*')
        .order('numero');

    if (error) {
        alert('Erro ao carregar dados');
        return;
    }

    renderAdminStats(data);
    renderAdminGrid(data);
    renderReservations(data);
}

// ── Estatísticas ──
function renderAdminStats(data) {
    const disponiveis = data.filter(n => n.status === 'disponivel').length;
    const reservados = data.filter(n => n.status === 'reservado').length;
    const pagos = data.filter(n => n.status === 'pago').length;
    const arrecadado = pagos * RIFA_CONFIG.valorPorNumero;
    const pendente = reservados * RIFA_CONFIG.valorPorNumero;

    document.getElementById('stat-disponiveis').textContent = disponiveis;
    document.getElementById('stat-reservados').textContent = reservados;
    document.getElementById('stat-pagos').textContent = pagos;
    document.getElementById('stat-arrecadado').textContent = `R$ ${arrecadado.toFixed(2)}`;
    document.getElementById('stat-pendente').textContent = `R$ ${pendente.toFixed(2)}`;
}

// ── Grid do admin ──
function renderAdminGrid(data) {
    const grid = document.getElementById('admin-grid');
    grid.innerHTML = '';

    data.forEach(n => {
        const cell = document.createElement('div');
        cell.className = `cell ${n.status}`;
        const numStr = String(n.numero).padStart(2, '0');

        if (n.status === 'pago') {
            const firstName = escapeHTML(n.nome ? n.nome.split(' ')[0] : '');
            cell.innerHTML = `
                <span class="cell-x">&times;</span>
                <span class="cell-number">${numStr}</span>
                <span class="cell-name">${firstName}</span>
            `;
        } else if (n.status === 'reservado') {
            cell.innerHTML = `
                <span class="cell-number">${numStr}</span>
                <span class="cell-label">Rsv</span>
            `;
        } else {
            cell.innerHTML = `<span class="cell-number">${numStr}</span>`;
        }

        grid.appendChild(cell);
    });
}

// ── Lista de reservas ──
function renderReservations(data) {
    const container = document.getElementById('reservations-list');
    const comDono = data.filter(n => n.status === 'reservado' || n.status === 'pago');

    // Agrupar por nome+telefone+status
    const groups = {};
    comDono.forEach(n => {
        const key = `${n.nome}|${n.telefone}|${n.status}`;
        if (!groups[key]) {
            groups[key] = {
                nome: n.nome,
                telefone: n.telefone,
                numeros: [],
                status: n.status,
                reservado_em: n.reservado_em
            };
        }
        groups[key].numeros.push(n.numero);
    });

    container.innerHTML = '';

    const entries = Object.values(groups);

    if (entries.length === 0) {
        container.innerHTML = '<p class="no-reservations">Nenhuma reserva ainda.</p>';
        return;
    }

    // Reservados primeiro, depois pagos
    entries.sort((a, b) => {
        if (a.status === 'reservado' && b.status === 'pago') return -1;
        if (a.status === 'pago' && b.status === 'reservado') return 1;
        return new Date(b.reservado_em) - new Date(a.reservado_em);
    });

    entries.forEach(group => {
        const valor = group.numeros.length * RIFA_CONFIG.valorPorNumero;
        const numerosStr = group.numeros
            .sort((a, b) => a - b)
            .map(n => String(n).padStart(2, '0'))
            .join(', ');
        const telefoneClean = group.telefone ? group.telefone.replace(/\D/g, '') : '';
        const dataStr = group.reservado_em
            ? new Date(group.reservado_em).toLocaleString('pt-BR')
            : '-';

        const card = document.createElement('div');
        card.className = `reservation-card status-${group.status}`;

        const nomeSafe = escapeHTML(group.nome || 'Sem nome');
        const telSafe = escapeHTML(group.telefone || '-');

        card.innerHTML = `
            <div class="reservation-info">
                <h4>${nomeSafe}</h4>
                <p class="res-detail"><span class="res-icon">📱</span> ${telSafe}</p>
                <p class="res-detail"><span class="res-icon">🎯</span> Números: <strong>${numerosStr}</strong></p>
                <p class="res-detail"><span class="res-icon">💰</span> Valor: <strong>R$ ${valor.toFixed(2)}</strong></p>
                <p class="res-detail"><span class="res-icon">📅</span> ${escapeHTML(dataStr)}</p>
                <span class="status-badge badge-${group.status}">
                    ${group.status === 'pago' ? '✅ Pago' : '⏳ Aguardando Pagamento'}
                </span>
            </div>
            <div class="reservation-actions">
                ${telefoneClean ? `
                    <a href="https://wa.me/55${escapeHTML(telefoneClean)}" target="_blank" rel="noopener"
                       class="btn-action btn-whatsapp">
                        📱 WhatsApp
                    </a>
                ` : ''}
                ${group.status === 'reservado' ? `
                    <button onclick="confirmarPagamento([${group.numeros.join(',')}])"
                            class="btn-action btn-confirmar">
                        ✅ Pagamento Confirmado
                    </button>
                    <button onclick="cancelarReserva([${group.numeros.join(',')}])"
                            class="btn-action btn-cancelar">
                        ❌ Cancelar Reserva
                    </button>
                ` : ''}
            </div>
        `;

        container.appendChild(card);
    });
}

// ── Confirmar pagamento ──
async function confirmarPagamento(numeros) {
    const numerosStr = numeros.map(n => String(n).padStart(2, '0')).join(', ');
    if (!confirm(`Confirmar pagamento dos números ${numerosStr}?`)) return;

    const { error } = await supabaseClient.rpc('confirmar_pagamento', {
        p_numeros: numeros
    });

    if (error) {
        alert('Erro ao confirmar pagamento. Tente novamente.');
        return;
    }

    loadAdmin();
}

// ── Cancelar reserva ──
async function cancelarReserva(numeros) {
    const numerosStr = numeros.map(n => String(n).padStart(2, '0')).join(', ');
    if (!confirm(`Cancelar reserva dos números ${numerosStr}?\nOs números voltarão a ficar disponíveis.`)) return;

    const { error } = await supabaseClient.rpc('cancelar_reserva', {
        p_numeros: numeros
    });

    if (error) {
        alert('Erro ao cancelar reserva. Tente novamente.');
        return;
    }

    loadAdmin();
}

// ── Realtime ──
function subscribeAdminRealtime() {
    supabaseClient
        .channel('rifa-admin')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'rifa_numeros' },
            () => { if (isLoggedIn) loadAdmin(); }
        )
        .subscribe();
}
