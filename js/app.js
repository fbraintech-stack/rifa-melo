// =============================================
// RIFA HEINEKEN — Página Pública
// =============================================

let selectedNumbers = [];
let allNumbers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadGrid();
    subscribeRealtime();
    setupEventListeners();
});

// ── Carregar grid do Supabase ──
async function loadGrid() {
    const grid = document.getElementById('grid');

    // Loading state (só na primeira vez)
    if (allNumbers.length === 0) {
        grid.innerHTML = '';
        for (let i = 0; i < 100; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'cell cell-skeleton';
            skeleton.innerHTML = '<span class="cell-number">--</span>';
            grid.appendChild(skeleton);
        }
    }

    const { data, error } = await supabaseClient
        .from('rifa_numeros')
        .select('*')
        .order('numero');

    if (error) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;grid-column:1/-1;opacity:0.7;">Erro ao carregar. Recarregue a página.</p>';
        return;
    }

    allNumbers = data;
    renderGrid(data);
}

// ── Renderizar grid ──
function renderGrid(numeros) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    numeros.forEach(n => {
        const cell = document.createElement('div');
        cell.className = `cell ${n.status}`;
        cell.dataset.numero = n.numero;

        const numStr = String(n.numero).padStart(2, '0');

        if (n.status === 'disponivel') {
            cell.onclick = () => toggleSelection(n.numero);
            cell.innerHTML = `<span class="cell-number">${numStr}</span>`;
            if (selectedNumbers.includes(n.numero)) {
                cell.classList.add('selected');
            }
        } else if (n.status === 'reservado') {
            cell.innerHTML = `
                <span class="cell-number">${numStr}</span>
                <span class="cell-label">Reservado</span>
            `;
        } else if (n.status === 'pago') {
            const firstName = escapeHTML(n.nome ? n.nome.split(' ')[0] : '');
            cell.innerHTML = `
                <span class="cell-x">&times;</span>
                <span class="cell-number">${numStr}</span>
                <span class="cell-name">${firstName}</span>
            `;
        }

        grid.appendChild(cell);
    });
}

// ── Seleção de números ──
function toggleSelection(numero) {
    const idx = selectedNumbers.indexOf(numero);

    if (idx > -1) {
        selectedNumbers.splice(idx, 1);
    } else {
        if (selectedNumbers.length >= RIFA_CONFIG.maxPorCompra) {
            showError(`Máximo de ${RIFA_CONFIG.maxPorCompra} números por compra.`);
            return;
        }
        selectedNumbers.push(numero);
    }

    selectedNumbers.sort((a, b) => a - b);
    updateSelectionBar();
    updateGridSelection();
}

function updateGridSelection() {
    document.querySelectorAll('.cell.disponivel').forEach(cell => {
        const num = parseInt(cell.dataset.numero);
        cell.classList.toggle('selected', selectedNumbers.includes(num));
    });
}

function updateSelectionBar() {
    const bar = document.getElementById('selection-bar');
    const numbersEl = document.getElementById('selected-numbers');
    const totalEl = document.getElementById('selected-total');
    const countEl = document.getElementById('selected-count');

    if (selectedNumbers.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    bar.classList.remove('hidden');
    const numerosStr = selectedNumbers.map(n => String(n).padStart(2, '0')).join(', ');
    numbersEl.textContent = `Nº ${numerosStr}`;
    countEl.textContent = `${selectedNumbers.length} número${selectedNumbers.length > 1 ? 's' : ''}`;
    totalEl.textContent = `R$ ${(selectedNumbers.length * RIFA_CONFIG.valorPorNumero).toFixed(2)}`;
}

// ── Checkout ──
function showCheckout() {
    const main = document.querySelector('.main-content');
    const checkout = document.getElementById('checkout');
    const resumo = document.getElementById('checkout-resumo');
    const valor = selectedNumbers.length * RIFA_CONFIG.valorPorNumero;
    const numerosStr = selectedNumbers.map(n => String(n).padStart(2, '0')).join(', ');

    resumo.innerHTML = `
        <div class="resumo-item">
            <span>Números escolhidos:</span>
            <strong>${numerosStr}</strong>
        </div>
        <div class="resumo-item">
            <span>Quantidade:</span>
            <strong>${selectedNumbers.length}</strong>
        </div>
        <div class="resumo-item total">
            <span>Total a pagar:</span>
            <strong>R$ ${valor.toFixed(2)}</strong>
        </div>
    `;

    main.classList.add('hidden');
    checkout.classList.remove('hidden');
    document.getElementById('pix-result').classList.add('hidden');
    document.getElementById('form-checkout').classList.remove('hidden');
    document.getElementById('form-checkout').reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideCheckout() {
    document.querySelector('.main-content').classList.remove('hidden');
    document.getElementById('checkout').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Gerar PIX ──
async function handleGerarPix(e) {
    e.preventDefault();

    const nome = document.getElementById('nome').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const btn = document.getElementById('btn-gerar-pix');

    if (!nome || !telefone) {
        showError('Preencha nome e telefone.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Reservando números...';

    // Chamar função atômica do Supabase
    const { data, error } = await supabaseClient.rpc('reservar_numeros', {
        p_numeros: selectedNumbers,
        p_nome: nome,
        p_telefone: telefone
    });

    if (error) {
        btn.disabled = false;
        btn.textContent = 'Gerar PIX';
        showError('Erro de conexão. Tente novamente.');
        return;
    }

    if (!data.success) {
        btn.disabled = false;
        btn.textContent = 'Gerar PIX';
        const indisponiveis = data.indisponiveis
            ? data.indisponiveis.map(n => String(n).padStart(2, '0')).join(', ')
            : '';
        showError(`${data.message}. Números indisponíveis: ${indisponiveis}. Escolha outros números.`);
        selectedNumbers = [];
        updateSelectionBar();
        loadGrid();
        hideCheckout();
        return;
    }

    // Números reservados — gerar PIX
    const valor = selectedNumbers.length * RIFA_CONFIG.valorPorNumero;
    const txid = 'RIFA' + Date.now().toString(36).toUpperCase();

    const pixPayload = generatePixPayload(
        RIFA_CONFIG.pixChave,
        RIFA_CONFIG.pixNome,
        RIFA_CONFIG.pixCidade,
        valor,
        txid
    );

    // Exibir resultado PIX
    document.getElementById('pix-valor').textContent = valor.toFixed(2);
    document.getElementById('pix-code').value = pixPayload;
    generateQRCode('qrcode', pixPayload);

    // Botão WhatsApp com texto pré-preenchido
    const numerosStr = selectedNumbers.map(n => String(n).padStart(2, '0')).join(', ');
    const whatsMsg = encodeURIComponent(
        `Olá, meu nome é ${nome}, escolhi o(s) número(s) ${numerosStr} e fiz o pagamento no valor de R$ ${valor.toFixed(2)}. Abaixo está o comprovante.`
    );
    document.getElementById('btn-comprovante').href =
        `https://wa.me/${RIFA_CONFIG.whatsappNumero}?text=${whatsMsg}`;

    document.getElementById('pix-result').classList.remove('hidden');
    document.getElementById('form-checkout').classList.add('hidden');

    btn.disabled = false;
    btn.textContent = 'Gerar PIX';

    // Limpar seleção e recarregar grid
    selectedNumbers = [];
    updateSelectionBar();
    loadGrid();
}

// ── Copiar código PIX ──
function copiarPix() {
    const code = document.getElementById('pix-code').value;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copiar');
        btn.textContent = 'Copiado!';
        btn.classList.add('copiado');
        setTimeout(() => {
            btn.textContent = 'Copiar';
            btn.classList.remove('copiado');
        }, 2500);
    }).catch(() => {
        // Fallback para navegadores sem clipboard API
        const input = document.getElementById('pix-code');
        input.select();
        document.execCommand('copy');
        const btn = document.getElementById('btn-copiar');
        btn.textContent = 'Copiado!';
        btn.classList.add('copiado');
        setTimeout(() => {
            btn.textContent = 'Copiar';
            btn.classList.remove('copiado');
        }, 2500);
    });
}

// ── Máscara de telefone ──
function mascaraTelefone(e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 6) {
        v = `(${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7)}`;
    } else if (v.length > 2) {
        v = `(${v.substring(0, 2)}) ${v.substring(2)}`;
    }
    e.target.value = v;
}

// ── Realtime (atualiza grid quando alguém reserva/paga) ──
function subscribeRealtime() {
    supabaseClient
        .channel('rifa-public')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'rifa_numeros' },
            () => loadGrid()
        )
        .subscribe();
}

// ── Modal de erro ──
function showError(msg) {
    document.getElementById('modal-error-msg').textContent = msg;
    document.getElementById('modal-error').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-error').classList.add('hidden');
}

// ── Event Listeners ──
function setupEventListeners() {
    document.getElementById('btn-finalizar').addEventListener('click', showCheckout);
    document.getElementById('btn-voltar').addEventListener('click', hideCheckout);
    document.getElementById('form-checkout').addEventListener('submit', handleGerarPix);
    document.getElementById('btn-copiar').addEventListener('click', copiarPix);
    document.getElementById('telefone').addEventListener('input', mascaraTelefone);

    // Fechar modal ao clicar fora
    document.getElementById('modal-error').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-error')) closeModal();
    });
}
